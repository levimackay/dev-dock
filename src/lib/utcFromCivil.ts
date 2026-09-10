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
 *
 * The subtlety is *when* to use it. Repairing the year after calling `Date.UTC`
 * is not enough, because by then the calendar has already been resolved against
 * the wrong year and a rollover cannot be undone. Year 0 is a leap year, being
 * divisible by 400; 1900 is not, being divisible by 100 but not 400. So
 * `Date.UTC(0, 1, 29)` resolves 1900-02-29, a date that does not exist, into
 * 1900-03-01, and setting the year afterwards yields 0000-03-01 for an input of
 * 0000-02-29. Passing month and day to `setUTCFullYear` in the same call means
 * the calendar is only ever resolved against the year that was asked for.
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
  if (year >= 100 || year < 0) {
    return Date.UTC(year, monthIndex, day, hour, minute, second, ms)
  }

  const date = new Date(0)
  date.setUTCFullYear(year, monthIndex, day)
  date.setUTCHours(hour, minute, second, ms)
  return date.getTime()
}
