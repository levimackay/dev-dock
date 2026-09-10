import { utcFromCivil } from './utcFromCivil'

/**
 * Converting between an IANA time zone's wall clock and a UTC instant.
 *
 * Shared because both time tools need exactly this, and for a while both had
 * their own copy with a comment explaining that tool folders may not import one
 * another. That is half the rule: they may not import *each other*, and what
 * two of them need moves here. The cost of the copy was not hypothetical, a
 * `Date.UTC` bug in this code had to be found and fixed twice, and a fix
 * applied to one file and not the other is precisely how two tools start
 * disagreeing about the same instant.
 *
 * ## Why offsets are read from `Intl` rather than computed
 *
 * There is no arithmetic that turns "America/Denver" into an offset. The answer
 * depends on the tz database: which dates DST covers that year, whether the
 * zone has changed its standard offset, whether it observes DST at all any
 * more. The browser already ships that database and keeps it current, so the
 * offset is *measured*: format the instant in the zone, read the civil fields
 * back, and take the difference from the same fields read as UTC.
 */

/** The offset in milliseconds that `timeZone` has from UTC at `instantMs`: local = UTC + offset. */
export function tzOffsetMs(instantMs: number, timeZone: string): number {
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

export interface CivilFields {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

/**
 * Converts wall-clock fields, read in `timeZone`, to the UTC instant they name.
 *
 * Two passes, and the second one is the interesting part. Finding the offset
 * needs an instant, and finding the instant needs the offset, so the first pass
 * guesses by treating the fields as UTC and asking what the offset was *there*.
 * Near a DST transition that guess can land on the wrong side of the boundary
 * and produce an offset an hour out, so the result is measured again at the
 * corrected instant. If the two agree, the answer is settled; if they disagree,
 * the second is the one taken at an instant that actually exists.
 *
 * Times inside a spring-forward gap do not exist at all in the zone: on 8 March
 * 2026 in Denver the clock goes straight from 02:00 to 03:00, so 02:30 never
 * happens. There is no correct answer, only a defined one. This resolves such a
 * time using the post-transition offset, which lands on the real instant
 * half an hour *before* the gap opened. Documented rather than hidden, because
 * a caller that cares can detect it by round-tripping the result.
 */
export function zonedTimeToUtc(fields: CivilFields, timeZone: string): Date {
  const guess = utcFromCivil(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second,
    fields.ms,
  )
  const firstOffset = tzOffsetMs(guess, timeZone)
  const once = guess - firstOffset
  const secondOffset = tzOffsetMs(once, timeZone)
  return new Date(secondOffset === firstOffset ? once : guess - secondOffset)
}
