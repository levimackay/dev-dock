import { formatRelative as shared } from '@/lib/relativeTime'

/**
 * A short "in 3 hours" / "2 days ago" phrase for a projected cron run.
 *
 * Argument order is `(target, from)` because that is how the caller reads: the
 * run time first, the clock second. The work happens in `src/lib/relativeTime`,
 * which the JWT decoder and the timestamp tool also use.
 *
 * This file used to hold its own copy, with a comment explaining that a tool
 * folder must not import another tool folder. True, and beside the point: the
 * rule's other half says anything two tools need moves to `src/lib`. Three
 * copies had drifted into three different answers for the same instant.
 *
 * Cron runs are projected ten at a time and rarely more than a few weeks out,
 * so the ladder stops at days: "in 45 days" is more useful for a schedule than
 * "in 2 months", and the near window is a single second because the next run
 * genuinely can be that close.
 */
export function formatRelative(target: Date, from: Date): string {
  return shared(from.getTime(), target.getTime(), {
    nearMs: 1000,
    nowLabel: 'now',
    maxUnit: 'day',
  })
}
