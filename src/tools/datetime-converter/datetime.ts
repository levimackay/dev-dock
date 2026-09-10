/**
 * Flexible date/time parsing and multi-format rendering, the pure logic half
 * of the tool.
 *
 * The core rule this file follows: **never hand ambiguous text straight to
 * `new Date(...)`.** The `Date` constructor's string parsing is
 * implementation-defined outside a handful of formats, and it has one
 * genuinely surprising landmine that is worth naming up front:
 *
 *     new Date('2026-03-15')          // UTC midnight   (date-only ISO)
 *     new Date('2026-03-15T00:00')    // LOCAL midnight (date-time ISO, no zone)
 *
 * Both are valid ISO 8601 prefixes of the same calendar date, and the spec
 * genuinely requires the engine to treat them differently: a date-only form
 * is defined as UTC, a date-time form with no offset is defined as local.
 * Nobody typing a bare date into a text box has that distinction in mind, so
 * rather than inherit it invisibly, this parser detects the date-only case
 * explicitly and asks the caller which interpretation was meant (`dateOnlyAs`
 * below) instead of picking silently.
 *
 * Every format this file accepts is identified by its own regex before any
 * `Date` object is built from it, and only RFC 2822, which is unambiguous
 * once matched, because the standard always carries an explicit zone, is
 * ever handed to the `Date` constructor at all.
 */

import { utcFromCivil } from '@/lib/utcFromCivil'

/** How to interpret a bare date with no time component, e.g. "2026-03-15". */
export type DateOnlyInterpretation = 'utc' | 'zone'

export interface ParseOptions {
  /** The IANA zone (or "UTC") used for offset-less input: a bare date read as `dateOnlyAs: 'zone'`, or a date-time with no zone suffix. */
  zone: string
  dateOnlyAs: DateOnlyInterpretation
  /** Injectable clock, so "now" is testable. Defaults to the real clock. */
  now?: () => Date
}

export type ParsedFormat = 'now' | 'iso-date' | 'iso-datetime' | 'rfc2822' | 'epoch'

export interface ParseSuccess {
  ok: true
  date: Date
  /** True for a bare date with no time part, the ambiguous case `dateOnlyAs` resolves. */
  dateOnly: boolean
  format: ParsedFormat
}

export interface ParseFailure {
  ok: false
  error: string
}

export type ParseResult = ParseSuccess | ParseFailure

const ISO_DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const ISO_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/i
/** The widest instant a JS `Date` can hold, per the ECMAScript spec. */
const MAX_DATE_MS = 8_640_000_000_000_000

const EPOCH_NUMBER = /^-?\d+(\.\d+)?$/
const RFC2822 =
  /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}\s+\d{2}:\d{2}(?::\d{2})?\s+(?:[+-]\d{4}|UT|UTC|GMT|Z|[A-Z]{1,5})$/i

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] // Feb generous; validated separately

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) return isLeapYear(year) ? 29 : 28
  return DAYS_IN_MONTH[month1to12 - 1] ?? 31
}

/** Validates calendar fields so `13` for a month or `31` for April fails loudly instead of silently rolling over into the next month, which is what `Date.UTC` would otherwise do. */
function validateCivilFields(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
): string | undefined {
  if (mo < 1 || mo > 12) return `Month ${mo} is not valid, expected 1-12.`
  if (d < 1 || d > daysInMonth(y, mo)) return `${y}-${String(mo).padStart(2, '0')} has no day ${d}.`
  if (h > 23) return `Hour ${h} is not valid, expected 0-23.`
  if (mi > 59) return `Minute ${mi} is not valid, expected 0-59.`
  if (s > 59) return `Second ${s} is not valid, expected 0-59.`
  return undefined
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

interface CivilFields {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

/** Converts wall-clock civil fields, read in `timeZone`, to the UTC instant they name. Two passes to handle a DST edge. See the unix-timestamp tool's `epoch.ts` for the same technique, written independently because tool folders do not import each other. */
function zonedTimeToUtc(fields: CivilFields, timeZone: string): Date {
  const guess = utcFromCivil(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
    fields.ms,
  )
  const offset1 = tzOffsetMs(guess, timeZone)
  const once = guess - offset1
  const offset2 = tzOffsetMs(once, timeZone)
  return new Date(guess - offset2)
}

export function parseFlexible(input: string, options: ParseOptions): ParseResult {
  const text = input.trim()
  if (text === '') return { ok: false, error: 'Enter a date/time, or type "now".' }

  if (/^now$/i.test(text)) {
    const clock = options.now ?? (() => new Date())
    return { ok: true, date: clock(), dateOnly: false, format: 'now' }
  }

  const dateOnly = ISO_DATE_ONLY.exec(text)
  if (dateOnly) {
    const [, ys, mos, ds] = dateOnly
    const year = Number(ys)
    const month = Number(mos)
    const day = Number(ds)
    const invalid = validateCivilFields(year, month, day, 0, 0, 0)
    if (invalid) return { ok: false, error: invalid }
    const date =
      options.dateOnlyAs === 'utc'
        ? new Date(utcFromCivil(year, month - 1, day))
        : zonedTimeToUtc({ year, month, day, hour: 0, minute: 0, second: 0, ms: 0 }, options.zone)
    return { ok: true, date, dateOnly: true, format: 'iso-date' }
  }

  const dateTime = ISO_DATETIME.exec(text)
  if (dateTime) {
    const [, ys, mos, ds, hs, mis, ss, fracs, zone] = dateTime
    const year = Number(ys)
    const month = Number(mos)
    const day = Number(ds)
    const hour = Number(hs)
    const minute = Number(mis)
    const second = ss ? Number(ss) : 0
    const ms = fracs ? Number(fracs.slice(0, 3).padEnd(3, '0')) : 0
    const invalid = validateCivilFields(year, month, day, hour, minute, second)
    if (invalid) return { ok: false, error: invalid }

    let date: Date
    if (!zone) {
      date = zonedTimeToUtc({ year, month, day, hour, minute, second, ms }, options.zone)
    } else if (/^z$/i.test(zone)) {
      date = new Date(utcFromCivil(year, month - 1, day, hour, minute, second, ms))
    } else {
      const offsetMatch = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)!
      const sign = offsetMatch[1] === '-' ? -1 : 1
      const offsetMin = sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
      date = new Date(
        utcFromCivil(year, month - 1, day, hour, minute, second, ms) - offsetMin * 60_000,
      )
    }
    return { ok: true, date, dateOnly: false, format: 'iso-datetime' }
  }

  if (RFC2822.test(text)) {
    // RFC 2822 always carries an explicit zone (a numeric offset or a named
    // one), so unlike a bare ISO string it has no local-vs-UTC ambiguity,
    // this is the one case where deferring to the platform parser is safe,
    // precisely because the shape has already been verified.
    const parsedMs = Date.parse(text)
    if (Number.isNaN(parsedMs)) {
      return { ok: false, error: `"${text}" looks like RFC 2822 but the date itself is not valid.` }
    }
    return { ok: true, date: new Date(parsedMs), dateOnly: false, format: 'rfc2822' }
  }

  if (EPOCH_NUMBER.test(text)) {
    // Two units only (seconds, milliseconds), the dedicated Unix Timestamp
    // tool covers micro/nanosecond epochs with a fuller heuristic; here the
    // question is only ever "seconds or millis", so a digit-count split is
    // enough: "now" in seconds is 10 digits, in millis 13.
    const digits = text.replace(/^-/, '').split('.')[0]?.length ?? 0
    const value = Number(text)
    const ms = digits <= 10 ? value * 1000 : value
    // A nanosecond epoch pasted here (1700000000000000000) is a plausible
    // mistake and lands far outside what Date can hold. Without this the
    // function reports success with an Invalid Date, and the first row that
    // calls toISOString() throws in render.
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
      return {
        ok: false,
        error: `${text} is outside the range a JavaScript Date can represent (±8,640,000,000,000,000 ms from 1970, roughly year -271821 to 275760). If that is a microsecond or nanosecond epoch, the Unix Timestamp tool converts those.`,
      }
    }
    return { ok: true, date: new Date(ms), dateOnly: false, format: 'epoch' }
  }

  return {
    ok: false,
    error: `Could not recognise "${text}" as a date. Accepted: ISO 8601 (2026-03-15, 2026-03-15T14:30, 2026-03-15T14:30:00Z), RFC 2822 (Mon, 15 Mar 2026 14:30:00 GMT), an epoch number, or "now".`,
  }
}

// ------------------------------------------------------------- rendering

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

export function toIso8601(date: Date, withMs = true): string {
  const iso = date.toISOString()
  return withMs ? iso : iso.replace(/\.\d{3}Z$/, 'Z')
}

/** `toUTCString` already emits exactly the RFC 2822 / RFC 1123 shape. */
export function toRfc2822(date: Date): string {
  return date.toUTCString()
}

/** RFC 3339 is ISO 8601's stricter internet profile; they coincide for a UTC instant. */
export function toRfc3339(date: Date, withMs = true): string {
  return toIso8601(date, withMs)
}

/** HTTP-date (RFC 7231 IMF-fixdate) is, character for character, what `toUTCString` produces. */
export function toHttpDate(date: Date): string {
  return date.toUTCString()
}

export function toSqlDatetime(date: Date, timeZone: string): string {
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
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

export function toEpochSeconds(date: Date): string {
  return Math.floor(date.getTime() / 1000).toString()
}

export function toEpochMillis(date: Date): string {
  return date.getTime().toString()
}

export function toHumanString(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

/**
 * ISO 8601 week-date: `YYYY-Www-D`. Weeks start Monday, and week 1 is the week
 * containing the year's first Thursday, equivalently, the week containing
 * 4 January. The civil date is read in `timeZone` first, because a week date
 * is a property of a calendar date, not of an instant.
 */
export function toIsoWeekDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  const y = get('year')
  const m = get('month')
  const d = get('day')

  const civil = new Date(utcFromCivil(y, m - 1, d))
  const weekday = (civil.getUTCDay() + 6) % 7 // Monday = 0 .. Sunday = 6
  civil.setUTCDate(civil.getUTCDate() - weekday + 3) // move to this week's Thursday
  const isoYear = civil.getUTCFullYear()

  const jan4 = new Date(utcFromCivil(isoYear, 0, 4))
  const jan4Weekday = (jan4.getUTCDay() + 6) % 7
  const week1Monday = jan4.getTime() - jan4Weekday * 86_400_000
  const week = Math.round((civil.getTime() - week1Monday) / (7 * 86_400_000)) + 1

  return `${isoYear}-W${pad(week)}-${weekday + 1}`
}

// --------------------------------------------------------- zone snapshots

export interface ZoneSnapshot {
  timeZone: string
  /** "+05:30" style, always signed. */
  offset: string
  offsetMinutes: number
  /** e.g. "EDT", "GMT+2", whatever the platform's short name is. */
  abbreviation: string
  isDst: boolean
  /** A full readable rendering in this zone. */
  formatted: string
}

function offsetMinutesAt(date: Date, timeZone: string): number {
  return Math.round(tzOffsetMs(date.getTime(), timeZone) / 60_000)
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/**
 * DST detection by comparison, not by name: fetch the zone's offset in
 * January and July of the instant's year. Daylight saving always moves the
 * clock *forward* relative to standard time, in either hemisphere, so the
 * smaller of those two offsets is standard time, and "now" is in DST exactly
 * when its own offset is larger than that.
 */
function isDstAt(date: Date, timeZone: string): boolean {
  const year = date.getUTCFullYear()
  const jan = offsetMinutesAt(new Date(utcFromCivil(year, 0, 1, 12)), timeZone)
  const jul = offsetMinutesAt(new Date(utcFromCivil(year, 6, 1, 12)), timeZone)
  const standard = Math.min(jan, jul)
  return offsetMinutesAt(date, timeZone) > standard
}

export function zoneSnapshot(date: Date, timeZone: string): ZoneSnapshot {
  const offsetMinutes = offsetMinutesAt(date, timeZone)
  const abbreviation =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short', hour: 'numeric' })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value ?? ''

  return {
    timeZone,
    offset: formatOffset(offsetMinutes),
    offsetMinutes,
    abbreviation,
    isDst: isDstAt(date, timeZone),
    formatted: toHumanString(date, timeZone),
  }
}

// -------------------------------------------------------------- duration

export interface DurationBreakdown {
  years: number
  months: number
  days: number
  hours: number
  minutes: number
  seconds: number
  totalDays: number
  totalHours: number
  totalMinutes: number
  totalSeconds: number
  totalMs: number
  /** True when `to` is earlier than `from`, every field above is still non-negative. */
  negative: boolean
}

/**
 * The calendar-aware breakdown between two instants: "2 years, 1 month,
 * 4 days" rather than just a total. Computed the way a person counts it by
 * hand: subtract field by field, borrowing from the next field up when a
 * subtraction goes negative: using UTC field accessors throughout so the
 * result never depends on the machine's own time zone.
 */
export function durationBetween(from: Date, to: Date): DurationBreakdown {
  const negative = to.getTime() < from.getTime()
  const start = negative ? to : from
  const end = negative ? from : to

  let years = end.getUTCFullYear() - start.getUTCFullYear()
  let months = end.getUTCMonth() - start.getUTCMonth()
  let days = end.getUTCDate() - start.getUTCDate()
  let hours = end.getUTCHours() - start.getUTCHours()
  let minutes = end.getUTCMinutes() - start.getUTCMinutes()
  let seconds = end.getUTCSeconds() - start.getUTCSeconds()

  if (seconds < 0) {
    seconds += 60
    minutes -= 1
  }
  if (minutes < 0) {
    minutes += 60
    hours -= 1
  }
  if (hours < 0) {
    hours += 24
    days -= 1
  }
  // Borrowing days has to be a loop, not a single step.
  //
  // The convention this settles on: borrow a whole month only when a whole
  // month's worth of days is available. From 31 January to 1 March that leaves
  // 0 months and 29 days rather than a clamped "1 month, 1 day", because
  // "31 January plus one month" has no agreed answer (28 February if you clamp,
  // 3 March if you overflow) and a span nobody can verify by counting is worse
  // than a plain day count. One borrow takes the
  // length of the month before `end`, and that month can be shorter than the
  // deficit: 31 January to 1 March borrows February's 28 days and is still two
  // days short, which used to surface in the UI as "1 month, -2 days".
  let borrowFromMonth = end.getUTCMonth() // 0-11, the month before is this index
  let borrowFromYear = end.getUTCFullYear()
  while (days < 0) {
    if (borrowFromMonth === 0) {
      borrowFromMonth = 12
      borrowFromYear -= 1
    }
    days += daysInMonth(borrowFromYear, borrowFromMonth)
    months -= 1
    borrowFromMonth -= 1
  }
  if (months < 0) {
    months += 12
    years -= 1
  }

  const totalMs = end.getTime() - start.getTime()
  return {
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
    totalDays: Math.floor(totalMs / 86_400_000),
    totalHours: Math.floor(totalMs / 3_600_000),
    totalMinutes: Math.floor(totalMs / 60_000),
    totalSeconds: Math.floor(totalMs / 1000),
    totalMs,
    negative,
  }
}
