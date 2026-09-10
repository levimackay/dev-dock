import { describe, expect, it } from 'vitest'
import { formatRelative } from './relativeTime'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const after = (ms: number) => formatRelative(0, ms)
const before = (ms: number) => formatRelative(ms, 0)

describe('formatRelative', () => {
  it('reads the near window as "just now" in both directions', () => {
    expect(after(0)).toBe('just now')
    expect(after(4 * SECOND)).toBe('just now')
    expect(before(4 * SECOND)).toBe('just now')
  })

  it('reads a future span as "in N"', () => {
    expect(after(30 * SECOND)).toBe('in 30 seconds')
    expect(after(2 * HOUR)).toBe('in 2 hours')
  })

  it('reads a past span as "N ago"', () => {
    expect(before(3 * DAY)).toBe('3 days ago')
  })

  it('uses the singular for exactly one', () => {
    expect(after(1 * HOUR)).toBe('in 1 hour')
    expect(before(1 * DAY)).toBe('1 day ago')
  })

  it('promotes to the next unit rather than saying "60 seconds"', () => {
    // The bug this test exists for: the unit is chosen before rounding, so
    // 59.6 seconds picks "second" and then rounds to 60.
    expect(after(59_600)).toBe('in 1 minute')
    expect(after(59.6 * MINUTE)).toBe('in 1 hour')
    expect(after(23.6 * HOUR)).toBe('in 1 day')
  })

  it('climbs through every unit', () => {
    expect(after(90 * SECOND)).toBe('in 2 minutes')
    expect(after(90 * MINUTE)).toBe('in 2 hours')
    expect(after(40 * DAY)).toBe('in 1 month')
    expect(after(400 * DAY)).toBe('in 1 year')
  })

  it('stops at the unit ceiling when asked', () => {
    expect(after(400 * DAY, )).toBe('in 1 year')
    expect(formatRelative(0, 400 * DAY, { maxUnit: 'day' })).toBe('in 400 days')
  })

  it('takes a custom near window and label', () => {
    expect(formatRelative(0, 900, { nearMs: 1000, nowLabel: 'now' })).toBe('now')
    expect(formatRelative(0, 1500, { nearMs: 1000, nowLabel: 'now' })).toBe('in 2 seconds')
  })

  it('is symmetric about the direction', () => {
    expect(formatRelative(0, 3 * HOUR)).toBe('in 3 hours')
    expect(formatRelative(3 * HOUR, 0)).toBe('3 hours ago')
  })
})
