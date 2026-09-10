/**
 * A cron expression parser, describer, and schedule projector.
 *
 * Written by hand rather than pulled from npm (`cron-parser` + `cronstrue` is
 * ~60 KB) because the whole problem is 300 readable lines and the interesting
 * part: turning a field spec into English that is actually correct, is
 * exactly the sort of thing a library gets subtly wrong for your dialect.
 *
 * ## Supported syntax
 *
 * Standard Vixie cron, five fields, plus an optional leading seconds field:
 *
 *     ┌─ minute (0-59)
 *     │ ┌─ hour (0-23)
 *     │ │ ┌─ day of month (1-31)
 *     │ │ │ ┌─ month (1-12 or JAN-DEC)
 *     │ │ │ │ ┌─ day of week (0-7 or SUN-SAT; both 0 and 7 mean Sunday)
 *     * * * * *
 *
 * Each field accepts `*`, a value, `a-b` ranges, `a-b/n` or `*\/n` steps, and
 * comma-separated lists of those. `?` is accepted as a synonym for `*` in the
 * two day fields, because Quartz users type it reflexively.
 *
 * Quartz-only extensions (`L`, `W`, `#`, and a year field) are *detected and
 * named* rather than silently mis-parsed, telling someone their expression is
 * Quartz-flavoured is far more useful than quietly scheduling the wrong thing.
 *
 * ## The day-of-month / day-of-week rule
 *
 * The one genuinely surprising piece of cron semantics: when *both* the day-of
 * -month and day-of-week fields are restricted, cron runs on days matching
 * **either**, not both. `0 0 1 * MON` fires on the 1st *and* on every Monday.
 * When only one is restricted, only that one applies. Getting this wrong is the
 * most common bug in hand-rolled cron code, so it is isolated in `matchesDay`.
 */

export interface CronField {
  /** Every value this field permits, sorted ascending. */
  values: number[]
  /** True when the field was `*` (or `?`), which changes day-matching. */
  wildcard: boolean
  raw: string
}

export interface CronExpression {
  seconds: CronField
  minutes: CronField
  hours: CronField
  daysOfMonth: CronField
  months: CronField
  daysOfWeek: CronField
  hasSeconds: boolean
  raw: string
}

export interface CronParseError {
  message: string
  /** 0-based index of the offending field, when the problem is field-local. */
  fieldIndex?: number
}

export type CronParseResult =
  { ok: true; expression: CronExpression } | { ok: false; error: CronParseError }

const MONTH_NAMES = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
]
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const MACROS: Record<string, { expression: string; description: string }> = {
  '@yearly': { expression: '0 0 1 1 *', description: 'once a year at midnight on 1 January' },
  '@annually': { expression: '0 0 1 1 *', description: 'once a year at midnight on 1 January' },
  '@monthly': { expression: '0 0 1 * *', description: 'once a month at midnight on the 1st' },
  '@weekly': { expression: '0 0 * * 0', description: 'once a week at midnight on Sunday' },
  '@daily': { expression: '0 0 * * *', description: 'once a day at midnight' },
  '@midnight': { expression: '0 0 * * *', description: 'once a day at midnight' },
  '@hourly': { expression: '0 * * * *', description: 'once an hour, on the hour' },
}

interface FieldSpec {
  name: string
  min: number
  max: number
  names?: string[]
}

const SPECS: FieldSpec[] = [
  { name: 'second', min: 0, max: 59 },
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12, names: MONTH_NAMES },
  { name: 'day of week', min: 0, max: 7, names: DAY_NAMES },
]

function parseField(raw: string, spec: FieldSpec, index: number): CronField | CronParseError {
  const text = raw.trim()
  if (text === '') {
    return { message: `The ${spec.name} field is empty.`, fieldIndex: index }
  }

  // Month and day names legitimately contain L and W (JUL, WED), so the Quartz
  // scan has to run against a copy with the known names blanked out first.
  // Checking the raw text here was a real bug: it rejected "JAN,jul".
  const withoutNames = (spec.names ?? []).reduce(
    (acc, name) => acc.replaceAll(name, ''),
    text.toUpperCase(),
  )
  const quartz = /[LW#]/.exec(withoutNames)
  if (quartz) {
    return {
      message: `“${quartz[0]}” is a Quartz extension (last / weekday / nth-weekday) that standard cron does not understand. Dev Dock parses standard cron only.`,
      fieldIndex: index,
    }
  }

  const wildcard = text === '*' || text === '?'
  const values = new Set<number>()

  for (const part of text.split(',')) {
    const parsed = parsePart(part, spec, index)
    if ('message' in parsed) return parsed
    for (const value of parsed) values.add(value)
  }

  if (values.size === 0) {
    return { message: `The ${spec.name} field “${text}” matches nothing.`, fieldIndex: index }
  }

  // Cron treats 0 and 7 as Sunday. Normalise to 0 so downstream comparisons
  // against Date#getDay never have to think about it.
  if (spec.name === 'day of week' && values.has(7)) {
    values.delete(7)
    values.add(0)
  }

  return { values: [...values].sort((a, b) => a - b), wildcard, raw: text }
}

function parsePart(part: string, spec: FieldSpec, index: number): number[] | CronParseError {
  const text = part.trim()
  const bad = (message: string): CronParseError => ({ message, fieldIndex: index })

  if (text === '') return bad(`The ${spec.name} field has an empty item in its list.`)

  let range = text
  let step = 1

  const slash = text.indexOf('/')
  if (slash !== -1) {
    range = text.slice(0, slash)
    const stepText = text.slice(slash + 1)
    if (!/^\d+$/.test(stepText)) {
      return bad(`“${stepText}” is not a step. A step must be a whole number, as in */5.`)
    }
    step = Number(stepText)
    if (step === 0) return bad('A step of 0 would never advance. Use /1 or higher.')
  }

  let start: number
  let end: number

  if (range === '*' || range === '?') {
    start = spec.min
    end = spec.max
  } else if (range.includes('-')) {
    const [fromText = '', toText = ''] = range.split('-', 2)
    const from = toNumber(fromText, spec)
    const to = toNumber(toText, spec)
    if (from === null) return bad(describeBadValue(fromText, spec))
    if (to === null) return bad(describeBadValue(toText, spec))
    if (from > to) {
      return bad(
        `The range ${range} runs backwards. Cron ranges do not wrap; write two items instead, as in ${to}-${spec.max},${spec.min}-${from}.`,
      )
    }
    start = from
    end = to
  } else {
    const value = toNumber(range, spec)
    if (value === null) return bad(describeBadValue(range, spec))
    // A bare value with a step means "from here to the end", e.g. 5/15.
    start = value
    end = slash === -1 ? value : spec.max
  }

  if (start < spec.min || end > spec.max) {
    return bad(
      `The ${spec.name} field accepts ${spec.min}-${spec.max}; “${text}” goes outside that.`,
    )
  }

  const out: number[] = []
  for (let value = start; value <= end; value += step) out.push(value)
  return out
}

function toNumber(text: string, spec: FieldSpec): number | null {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  if (!spec.names) return null
  const index = spec.names.indexOf(trimmed.toUpperCase())
  if (index === -1) return null
  // Month names are 1-based; day names are 0-based.
  return spec.name === 'month' ? index + 1 : index
}

function describeBadValue(text: string, spec: FieldSpec): string {
  const names = spec.names ? ` or a name such as ${spec.names[0]}` : ''
  return `“${text.trim()}” is not valid in the ${spec.name} field. Use ${spec.min}-${spec.max}${names}.`
}

export function parseCron(input: string): CronParseResult {
  const text = input.trim()
  if (text === '') {
    return { ok: false, error: { message: 'Enter a cron expression, for example 0 9 * * 1-5.' } }
  }

  if (text.startsWith('@')) {
    const macro = MACROS[text.toLowerCase()]
    if (!macro) {
      if (/^@every\b/i.test(text)) {
        return {
          ok: false,
          error: {
            message:
              '@every is a Go (robfig/cron) extension, not standard cron. Use a */n step instead.',
          },
        }
      }
      return {
        ok: false,
        error: {
          message: `Unknown macro “${text}”. Standard cron defines ${Object.keys(MACROS).join(', ')}.`,
        },
      }
    }
    return parseCron(macro.expression)
  }

  const parts = text.split(/\s+/)

  if (parts.length === 7) {
    return {
      ok: false,
      error: {
        message:
          'Seven fields means a Quartz expression with a trailing year. Dev Dock parses standard cron (five fields) or cron with seconds (six).',
      },
    }
  }
  if (parts.length !== 5 && parts.length !== 6) {
    return {
      ok: false,
      error: {
        message: `Expected 5 fields (minute hour day month weekday), or 6 with a leading seconds field. Found ${parts.length}.`,
      },
    }
  }

  const hasSeconds = parts.length === 6
  const specs = hasSeconds ? SPECS : SPECS.slice(1)
  const fields: CronField[] = []

  for (const [i, spec] of specs.entries()) {
    const parsed = parseField(parts[i]!, spec, i)
    if ('message' in parsed) return { ok: false, error: parsed }
    fields.push(parsed)
  }

  const everySecond: CronField = { values: [0], wildcard: false, raw: '0' }
  const [a, b, c, d, e, f] = fields

  return {
    ok: true,
    expression: {
      seconds: hasSeconds ? a! : everySecond,
      minutes: hasSeconds ? b! : a!,
      hours: hasSeconds ? c! : b!,
      daysOfMonth: hasSeconds ? d! : c!,
      months: hasSeconds ? e! : d!,
      daysOfWeek: hasSeconds ? f! : e!,
      hasSeconds,
      raw: text,
    },
  }
}

// -------------------------------------------------------------- matching

/**
 * The either/both rule. When day-of-month and day-of-week are both restricted,
 * cron fires on days matching *either*. When only one is restricted, only that
 * one is consulted.
 */
export function matchesDay(expr: CronExpression, date: Date, utc: boolean): boolean {
  const dom = utc ? date.getUTCDate() : date.getDate()
  const dow = utc ? date.getUTCDay() : date.getDay()

  const domMatch = expr.daysOfMonth.values.includes(dom)
  const dowMatch = expr.daysOfWeek.values.includes(dow)

  if (expr.daysOfMonth.wildcard && expr.daysOfWeek.wildcard) return true
  if (expr.daysOfMonth.wildcard) return dowMatch
  if (expr.daysOfWeek.wildcard) return domMatch
  return domMatch || dowMatch
}

export function matches(expr: CronExpression, date: Date, utc = false): boolean {
  const second = utc ? date.getUTCSeconds() : date.getSeconds()
  const minute = utc ? date.getUTCMinutes() : date.getMinutes()
  const hour = utc ? date.getUTCHours() : date.getHours()
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1

  return (
    expr.seconds.values.includes(second) &&
    expr.minutes.values.includes(minute) &&
    expr.hours.values.includes(hour) &&
    expr.months.values.includes(month) &&
    matchesDay(expr, date, utc)
  )
}

/**
 * Projects the next `count` firing times.
 *
 * Implemented as a bounded second-by-second scan with a fast skip: rather than
 * stepping one second at a time through years of non-matching time, it advances
 * a whole day whenever the day cannot match, and a whole minute whenever the
 * expression has no seconds field. In the pathological case (29 February on a
 * non-leap century) the iteration cap ends the search and the caller reports
 * that fewer runs were found, instead of spinning.
 */
export function nextRuns(
  expr: CronExpression,
  from: Date,
  count: number,
  utc = false,
): { runs: Date[]; exhausted: boolean } {
  const runs: Date[] = []
  const cursor = new Date(from.getTime())

  // Start strictly after `from`, so an expression that matches the current
  // instant reports its *next* firing rather than echoing the one happening now.
  cursor.setMilliseconds(0)
  cursor.setSeconds(cursor.getSeconds() + 1)

  const stepSeconds = expr.hasSeconds ? 1 : 60
  if (!expr.hasSeconds) {
    // Snapping to the top of the minute can move the cursor back before `from`;
    // when it does, skip to the following minute.
    cursor.setSeconds(0)
    if (cursor.getTime() <= from.getTime()) cursor.setMinutes(cursor.getMinutes() + 1)
  }

  // Bound the search by *time*, not by iteration count. An expression that can
  // never fire (0 0 30 2 *) skips a whole day per iteration, so an iteration
  // cap large enough for second-granularity expressions would let it walk
  // thousands of years before giving up, which measured at a full second of
  // blocked main thread. A five-year horizon ends it in milliseconds.
  const horizon = from.getTime() + 5 * 366 * 24 * 60 * 60 * 1000

  while (runs.length < count && cursor.getTime() <= horizon) {
    if (!expr.months.values.includes((utc ? cursor.getUTCMonth() : cursor.getMonth()) + 1)) {
      advanceToNextDay(cursor, utc)
      continue
    }
    if (!matchesDay(expr, cursor, utc)) {
      advanceToNextDay(cursor, utc)
      continue
    }
    if (matches(expr, cursor, utc)) {
      runs.push(new Date(cursor.getTime()))
    }
    cursor.setSeconds(cursor.getSeconds() + stepSeconds)
  }

  return { runs, exhausted: runs.length < count }
}

function advanceToNextDay(cursor: Date, utc: boolean): void {
  if (utc) {
    cursor.setUTCHours(0, 0, 0, 0)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  } else {
    cursor.setHours(0, 0, 0, 0)
    cursor.setDate(cursor.getDate() + 1)
  }
}

// ------------------------------------------------------------ describing

/** Renders a field as English: "every 5 minutes", "at 9 and 17", and so on. */
function describeField(field: CronField, spec: FieldSpec, render: (n: number) => string): string {
  if (field.wildcard) return `every ${spec.name}`

  const step = detectStep(field.values, spec)
  if (step && step.every > 1) {
    const range =
      step.from === spec.min && step.to === spec.max
        ? ''
        : ` from ${render(step.from)} through ${render(step.to)}`
    return `every ${step.every}${ordinalSuffix(step.every)} ${spec.name}${range}`
  }

  const listed = field.values.map(render)
  return `${spec.name} ${joinList(listed)}`
}

function ordinalSuffix(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

/** Recognises an evenly spaced series so it can be described as a step. */
function detectStep(
  values: number[],
  spec: FieldSpec,
): { every: number; from: number; to: number } | null {
  if (values.length < 2) return null
  const first = values[0]!
  const gap = values[1]! - first
  for (let i = 2; i < values.length; i++) {
    if (values[i]! - values[i - 1]! !== gap) return null
  }
  // Only call it a step if it actually reaches the end of the range; otherwise
  // "0,15,30" would be described as "every 15th" and lose the fact it stops.
  if (values[values.length - 1]! + gap <= spec.max) return null
  return { every: gap, from: first, to: values[values.length - 1]! }
}

function joinList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]!
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/** Turns a parsed expression into a sentence. */
export function describeCron(expr: CronExpression): string {
  const parts: string[] = []

  // Times first, because that is what people read for.
  const everyMinute = expr.minutes.wildcard
  const everyHour = expr.hours.wildcard
  const everySecond = expr.hasSeconds && expr.seconds.wildcard

  if (everySecond) {
    parts.push('Every second')
  } else if (everyMinute && everyHour) {
    parts.push(
      expr.hasSeconds
        ? `At second ${joinList(expr.seconds.values.map(String))} of every minute`
        : 'Every minute',
    )
  } else if (
    !everyMinute &&
    !everyHour &&
    expr.minutes.values.length * expr.hours.values.length <= 24
  ) {
    // Small enough to spell out as clock times, which reads far better than
    // "minute 30 past hour 9 and 17".
    const times: string[] = []
    for (const hour of expr.hours.values) {
      for (const minute of expr.minutes.values) times.push(`${pad(hour)}:${pad(minute)}`)
    }
    parts.push(`At ${joinList(times.sort())}`)
  } else {
    const minuteText = describeField(expr.minutes, { name: 'minute', min: 0, max: 59 }, String)
    const hourText = everyHour
      ? 'every hour'
      : describeField(expr.hours, { name: 'hour', min: 0, max: 23 }, String)
    parts.push(`At ${minuteText}, ${hourText}`)
  }

  // Then the calendar restrictions.
  const dayParts: string[] = []

  if (!expr.daysOfMonth.wildcard) {
    const step = detectStep(expr.daysOfMonth.values, { name: 'day', min: 1, max: 31 })
    dayParts.push(
      step && step.every > 1
        ? `every ${step.every}${ordinalSuffix(step.every)} day of the month from the ${step.from}${ordinalSuffix(step.from)}`
        : `on the ${joinList(expr.daysOfMonth.values.map((d) => `${d}${ordinalSuffix(d)}`))}`,
    )
  }

  if (!expr.daysOfWeek.wildcard) {
    dayParts.push(`on ${joinList(expr.daysOfWeek.values.map((d) => DAY_LONG[d] ?? String(d)))}`)
  }

  if (dayParts.length === 2) {
    // Spell out the either/both rule rather than assuming the reader knows it.
    parts.push(`${dayParts[0]} and also ${dayParts[1]} (cron fires on days matching either)`)
  } else if (dayParts.length === 1) {
    parts.push(dayParts[0]!)
  }

  if (!expr.months.wildcard) {
    parts.push(`in ${joinList(expr.months.values.map((m) => MONTH_LONG[m - 1] ?? String(m)))}`)
  }

  return `${parts.join(', ')}.`
}

/** Field-by-field breakdown for the UI's explanation table. */
export function explainFields(
  expr: CronExpression,
): Array<{ field: string; raw: string; meaning: string }> {
  const rows: Array<{ field: string; raw: string; meaning: string }> = []
  if (expr.hasSeconds) {
    rows.push({
      field: 'Second',
      raw: expr.seconds.raw,
      meaning: describeField(expr.seconds, { name: 'second', min: 0, max: 59 }, String),
    })
  }
  rows.push(
    {
      field: 'Minute',
      raw: expr.minutes.raw,
      meaning: describeField(expr.minutes, { name: 'minute', min: 0, max: 59 }, String),
    },
    {
      field: 'Hour',
      raw: expr.hours.raw,
      meaning: describeField(expr.hours, { name: 'hour', min: 0, max: 23 }, String),
    },
    {
      field: 'Day of month',
      raw: expr.daysOfMonth.raw,
      meaning: expr.daysOfMonth.wildcard
        ? 'every day of the month'
        : `the ${joinList(expr.daysOfMonth.values.map((d) => `${d}${ordinalSuffix(d)}`))}`,
    },
    {
      field: 'Month',
      raw: expr.months.raw,
      meaning: expr.months.wildcard
        ? 'every month'
        : joinList(expr.months.values.map((m) => MONTH_LONG[m - 1] ?? String(m))),
    },
    {
      field: 'Day of week',
      raw: expr.daysOfWeek.raw,
      meaning: expr.daysOfWeek.wildcard
        ? 'every day of the week'
        : joinList(expr.daysOfWeek.values.map((d) => DAY_LONG[d] ?? String(d))),
    },
  )
  return rows
}
