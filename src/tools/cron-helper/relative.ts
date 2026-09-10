/**
 * A short "in 3 hours" / "2 days ago" phrase for a projected cron run.
 *
 * Deliberately a small independent copy of the same idea in the Unix
 * Timestamp tool's `epoch.ts`, not a shared import, see
 * docs/ARCHITECTURE.md §2: a tool folder never imports another tool folder.
 * The duplication is a dozen lines; the alternative is coupling two tools
 * that should be free to evolve their own notion of "relative" independently.
 */
export function formatRelative(target: Date, from: Date): string {
  const diffMs = target.getTime() - from.getTime()
  const future = diffMs > 0
  const abs = Math.abs(diffMs)

  const units: Array<{ ms: number; label: string }> = [
    { ms: 86_400_000, label: 'day' },
    { ms: 3_600_000, label: 'hour' },
    { ms: 60_000, label: 'minute' },
    { ms: 1000, label: 'second' },
  ]

  if (abs < 1000) return 'now'

  let chosen = units[units.length - 1]!
  for (const unit of units) {
    if (abs >= unit.ms) {
      chosen = unit
      break
    }
  }
  const count = Math.round(abs / chosen.ms)
  const noun = `${count} ${chosen.label}${count === 1 ? '' : 's'}`
  return future ? `in ${noun}` : `${noun} ago`
}
