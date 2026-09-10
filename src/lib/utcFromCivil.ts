/**
 * `Date.UTC`, without the two-digit-year trap.
 *
 * `Date.UTC(50, 2, 15)` is 1950-03-15, not 0050-03-15. The remapping of years
 * 0 through 99 into 1900-1999 is a compatibility wart from the first version of
 * JavaScript, it is still in the spec, and it is silent: nothing reports that
 * the year you asked for is not the year you got.
 *
 * That matters here because both time tools accept a four-digit year from the
 * user, so `0050-03-15` is ordinary input, and because the timezone-offset
 * reconstruction in both tools rebuilds an instant from `Intl`-formatted
 * fields, which for any pre-100 CE instant would come back nineteen centuries
 * out with no indication anything had been reinterpreted.
 *
 * `setUTCFullYear` is the documented escape hatch: it takes the year literally.
 */
export function utcFromCivil(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  ms = 0,
): number {
  const timestamp = Date.UTC(year, monthIndex, day, hour, minute, second, ms)
  if (year >= 100 || year < 0 || Number.isNaN(timestamp)) return timestamp

  const date = new Date(timestamp)
  date.setUTCFullYear(year)
  return date.getTime()
}
