/**
 * Unix timestamp conversion: the pure logic half of the tool.
 *
 * The interesting engineering problem here is precision. A nanosecond epoch
 * for "now" is around 1.76e18, past `Number.MAX_SAFE_INTEGER` (9.007e15),
 * so parsing it as a `number` before converting to milliseconds would already
 * have lost precision before any conversion happens. Everything below works
 * in `bigint` nanoseconds until the very last step, where it collapses down
 * to the millisecond resolution `Date` actually has.
 */

import { utcFromCivil } from '@/lib/utcFromCivil'

export type TimestampUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds'

export const UNITS: readonly TimestampUnit[] = [
  'seconds',
  'milliseconds',
  'microseconds',
  'nanoseconds',
]

/**
 * Guesses which unit a raw timestamp is in, from its magnitude alone.
 *
 * "Now" has a stable digit count in each unit: 10 digits in seconds, 13 in
 * milliseconds, 16 in microseconds, 19 in nanoseconds (and will stay that way
 * for centuries: the digit count only rolls over roughly once every ten times
 * the unit's magnitude). The boundaries below sit one digit past each unit's
 * "now" count, so a present-day value lands solidly inside its bucket rather
 * than on an edge.
 *
 * This is inherently ambiguous in the boundary zone: an 11-digit value could
 * be a far-future seconds timestamp (year ~5000) or a milliseconds timestamp
 * from a past decade, and there is no way to tell from magnitude alone which
 * was meant. The heuristic resolves every ambiguous case toward the *shorter*
 * unit, because a short, round timestamp pasted from an API is overwhelmingly
 * more likely to be seconds or milliseconds than the exotic case of a
 * deliberately far-future date. The unit picked here is always a starting
 * point the user can override, never a claim of certainty.
 */
export function detectUnit(value: string): TimestampUnit {
  const digits =
    value
      .trim()
      .replace(/^[+-]/, '')
      .split('.')[0]
      ?.replace(/^0+(?=\d)/, '') ?? ''
  const count = digits.length || 1
  if (count <= 10) return 'seconds'
  if (count <= 13) return 'milliseconds'
  if (count <= 16) return 'microseconds'
  return 'nanoseconds'
}

/** The JS `Date` range: ±100,000,000 days from the epoch, in milliseconds. */
const MAX_DATE_MS = 8_640_000_000_000_000n
const MIN_DATE_MS = -MAX_DATE_MS

/** The signed-32-bit-seconds rollover: 2038-01-19T03:14:07Z. */
const Y2038_BOUNDARY_SECONDS = 2_147_483_647
/** "Near" the boundary means within about 90 days of it either side. */
const Y2038_WINDOW_SECONDS = 90 * 24 * 60 * 60

const NANOS_PER_UNIT: Record<TimestampUnit, bigint> = {
  seconds: 1_000_000_000n,
  milliseconds: 1_000_000n,
  microseconds: 1_000n,
  nanoseconds: 1n,
}

export interface ToInstantResult {
  ok: boolean
  date?: Date
  error?: string
  /** True when the resulting instant sits within ~90 days of the 2038 rollover. */
  near2038?: boolean
}

export function toInstant(rawValue: string, unit: TimestampUnit): ToInstantResult {
  const trimmed = rawValue.trim()
  if (trimmed === '') return { ok: false, error: 'Enter a timestamp.' }
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    return {
      ok: false,
      error: `“${trimmed}” is not a timestamp. Expected an integer (optionally with a decimal fraction), like 1700000000 or -1700000000.5.`,
    }
  }

  const negative = trimmed.startsWith('-')
  const unsigned = trimmed.replace(/^[+-]/, '')
  const [intDigits, fracDigits = ''] = unsigned.split('.')
  const nanosPerUnit = NANOS_PER_UNIT[unit]

  const intNanos = BigInt(intDigits || '0') * nanosPerUnit
  // Fractional digits are scaled against the unit's nanosecond weight with
  // exact bigint arithmetic (numerator/denominator), never a float division,
  // so a long fractional string never rounds the wrong way.
  let fracNanos = 0n
  if (fracDigits) {
    const numerator = BigInt(fracDigits) * nanosPerUnit
    const denominator = 10n ** BigInt(fracDigits.length)
    fracNanos = numerator / denominator
  }

  let totalNanos = intNanos + fracNanos
  if (negative) totalNanos = -totalNanos

  // Truncated toward zero rather than rounded: at most 1ms of error, which is
  // below Date's own resolution anyway, and simpler than signed bigint rounding.
  const ms = totalNanos / 1_000_000n

  if (ms > MAX_DATE_MS || ms < MIN_DATE_MS) {
    return {
      ok: false,
      error: `This instant is outside what JS \`Date\` can represent (roughly year -271821 to 275760). It does not become "Invalid Date" here. It is simply too far from 1970 for any browser Date object to hold.`,
    }
  }

  const date = new Date(Number(ms))
  const seconds = totalNanos / 1_000_000_000n
  const near2038 = Math.abs(Number(seconds) - Y2038_BOUNDARY_SECONDS) < Y2038_WINDOW_SECONDS

  return { ok: true, date, near2038 }
}

export interface EpochValues {
  seconds: string
  milliseconds: string
  microseconds: string
  nanoseconds: string
}

/**
 * The inverse of `toInstant`: a `Date` rendered in all four units.
 *
 * Returns `null` for an Invalid Date rather than throwing. `BigInt(NaN)` is a
 * `RangeError`, and this is exported, so an arbitrary `Date` from a caller that
 * did not range-check first would take the tool down.
 */
export function fromDate(date: Date): EpochValues | null {
  const time = date.getTime()
  if (!Number.isFinite(time)) return null
  const ms = BigInt(time)
  return {
    seconds: (ms / 1000n).toString(),
    milliseconds: ms.toString(),
    microseconds: (ms * 1000n).toString(),
    nanoseconds: (ms * 1_000_000n).toString(),
  }
}

const RELATIVE_UNITS: Array<{ ms: number; singular: string }> = [
  { ms: 1000, singular: 'second' },
  { ms: 60_000, singular: 'minute' },
  { ms: 3_600_000, singular: 'hour' },
  { ms: 86_400_000, singular: 'day' },
  { ms: 2_629_800_000, singular: 'month' }, // 30.4375 days: the Gregorian mean month
  { ms: 31_557_600_000, singular: 'year' }, // 365.25 days: the Gregorian mean year
]

/** A human phrase for how `from` relates to `to`: "3 hours ago", "in 2 days". */
export function formatRelative(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime()
  const future = diffMs < 0
  const abs = Math.abs(diffMs)

  if (abs < 5000) return 'just now'

  // Walk the unit ladder from the top down, picking the largest unit the span
  // reaches. `Intl.RelativeTimeFormat` is not used, and does no unit selection
  // of its own: it takes a value *and* a unit. It would give localised output,
  // which an English-only app does not need for eight lines of ladder.
  let index = 0
  for (const [i, unit] of RELATIVE_UNITS.entries()) {
    if (abs >= unit.ms) index = i
    else break
  }
  let chosen = RELATIVE_UNITS[index]!
  let count = Math.round(abs / chosen.ms)

  // Then check the rounding did not push the count into the next unit. 59.6
  // seconds selects "second" because it is under a minute, and rounds to 60,
  // so the ladder has to be walked once more after rounding or the tool says
  // "60 seconds ago", "60 minutes ago", "24 hours ago".
  const next = RELATIVE_UNITS[index + 1]
  if (next && count * chosen.ms >= next.ms) {
    chosen = next
    count = Math.round(abs / chosen.ms)
  }
  const noun = `${count} ${chosen.singular}${count === 1 ? '' : 's'}`
  return future ? `in ${noun}` : `${noun} ago`
}

/** RFC 2822 / RFC 1123 style: "Mon, 09 Sep 2026 20:30:00 GMT". `toUTCString` already emits exactly this. */
export function toRfc2822(date: Date): string {
  return date.toUTCString()
}

/** RFC 3339 is ISO 8601's stricter internet profile; for a UTC instant with millisecond precision the two coincide. */
export function toRfc3339(date: Date): string {
  return date.toISOString()
}

export function toIso8601(date: Date): string {
  return date.toISOString()
}

export function dayOfWeek(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(date)
}

/** A full, readable rendering of `date` as seen from `timeZone`, with the zone's abbreviation. */
export function formatInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
}

/** The offset (in ms) that `timeZone` has from UTC at `instantMs`: local = UTC + offset. */
function tzOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instantMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asIfUtc = utcFromCivil(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  )
  return asIfUtc - instantMs
}

export interface WallTime {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Converts wall-clock fields (as typed into a `datetime-local` input),
 * interpreted in `timeZone`, to the UTC instant they represent.
 *
 * There is no `Date` constructor that takes an arbitrary zone, so this uses
 * the standard technique (the same one date-fns-tz and Luxon use): treat the
 * fields as if they were UTC to get a first guess, ask `Intl` what offset the
 * target zone actually has at that guess, and correct for it. A second pass
 * catches the rare case where the correction itself crosses a DST transition,
 * which would otherwise leave the offset one hour off right at the edge.
 */
export function zonedTimeToUtc(fields: WallTime, timeZone: string): Date {
  const guess = utcFromCivil(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
  )
  const offset1 = tzOffsetMs(guess, timeZone)
  const once = guess - offset1
  const offset2 = tzOffsetMs(once, timeZone)
  return new Date(guess - offset2)
}

/** Parses the exact string a native `<input type="datetime-local">` produces. */
export function parseDatetimeLocalValue(value: string): WallTime | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return undefined
  const [, y, mo, d, h, mi, s] = match
  return {
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: s ? Number(s) : 0,
  }
}

/** The inverse of `parseDatetimeLocalValue`: builds the value a datetime-local input expects, for a given zone. */
export function toDatetimeLocalValue(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}
