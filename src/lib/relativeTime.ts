/**
 * "in 3 hours", "2 days ago": one implementation, shared.
 *
 * There were three, and they disagreed. Two took two `Date`s in opposite orders
 * (`(target, from)` versus `(from, to)`) with nothing to catch a swap, and the
 * three gave different answers for the same instant: a token expiring in a year
 * read "in 365 days" in one tool and "in 1 year" in another; three seconds out
 * was "in 3 seconds" in one and "just now" in the next.
 *
 * The signature is deliberately `(from, to)`, reading as "from A to B", and both
 * arguments are milliseconds so there is no `Date`/number ambiguity at a call
 * site either.
 */

interface Unit {
  ms: number
  singular: string
}

const UNITS: Unit[] = [
  { ms: 1000, singular: 'second' },
  { ms: 60_000, singular: 'minute' },
  { ms: 3_600_000, singular: 'hour' },
  { ms: 86_400_000, singular: 'day' },
  { ms: 2_592_000_000, singular: 'month' },
  { ms: 31_536_000_000, singular: 'year' },
]

export interface RelativeOptions {
  /** Spans shorter than this read as `nowLabel` instead of a count. */
  nearMs?: number
  nowLabel?: string
  /** Largest unit to use. Cutting at 'day' gives "in 400 days" rather than "in 1 year". */
  maxUnit?: Unit['singular']
}

export function formatRelative(
  fromMs: number,
  toMs: number,
  options: RelativeOptions = {},
): string {
  const { nearMs = 5000, nowLabel = 'just now', maxUnit = 'year' } = options

  const diff = toMs - fromMs
  const future = diff > 0
  const abs = Math.abs(diff)

  if (abs < nearMs) return nowLabel

  const ceiling = UNITS.findIndex((u) => u.singular === maxUnit)
  const usable = UNITS.slice(0, ceiling === -1 ? UNITS.length : ceiling + 1)

  let index = 0
  for (const [i, unit] of usable.entries()) {
    if (abs >= unit.ms) index = i
    else break
  }

  let chosen = usable[index]!
  let count = Math.round(abs / chosen.ms)

  // Rounding can push the count into the next unit: 59.6 seconds picks
  // "second" because it is under a minute, then rounds to 60. Without this the
  // output is "60 seconds ago", "60 minutes ago", "24 hours ago".
  const next = usable[index + 1]
  if (next && count * chosen.ms >= next.ms) {
    chosen = next
    count = Math.round(abs / chosen.ms)
  }

  const noun = `${count} ${chosen.singular}${count === 1 ? '' : 's'}`
  return future ? `in ${noun}` : `${noun} ago`
}
