import { describe, expect, it } from 'vitest'
import { tzOffsetMs, zonedTimeToUtc } from './zonedTime'

const HOUR = 3_600_000
const at = (iso: string) => new Date(iso).getTime()

const civil = (year: number, month: number, day: number, hour = 0, minute = 0) => ({
  year,
  month,
  day,
  hour,
  minute,
  second: 0,
  ms: 0,
})

describe('tzOffsetMs', () => {
  it('is zero for UTC', () => {
    expect(tzOffsetMs(at('2026-06-15T12:00:00Z'), 'UTC')).toBe(0)
  })

  it('reads a whole-hour negative offset', () => {
    expect(tzOffsetMs(at('2026-01-15T12:00:00Z'), 'America/Denver')).toBe(-7 * HOUR)
  })

  it('follows the same zone into daylight time', () => {
    expect(tzOffsetMs(at('2026-07-15T12:00:00Z'), 'America/Denver')).toBe(-6 * HOUR)
  })

  it('reads a half-hour offset', () => {
    expect(tzOffsetMs(at('2026-06-15T12:00:00Z'), 'Asia/Kolkata')).toBe(5.5 * HOUR)
  })

  it('reads a three-quarter-hour offset', () => {
    expect(tzOffsetMs(at('2026-06-15T12:00:00Z'), 'Asia/Kathmandu')).toBe(5.75 * HOUR)
  })

  it('reads a southern-hemisphere zone, where DST runs the other way', () => {
    expect(tzOffsetMs(at('2026-01-15T12:00:00Z'), 'Australia/Sydney')).toBe(11 * HOUR)
    expect(tzOffsetMs(at('2026-07-15T12:00:00Z'), 'Australia/Sydney')).toBe(10 * HOUR)
  })
})

describe('zonedTimeToUtc', () => {
  it('reads a wall time in UTC unchanged', () => {
    expect(zonedTimeToUtc(civil(2026, 6, 15, 12), 'UTC').toISOString()).toBe(
      '2026-06-15T12:00:00.000Z',
    )
  })

  it('reads a wall time in a fixed-offset part of the year', () => {
    expect(zonedTimeToUtc(civil(2026, 1, 15, 9), 'America/Denver').toISOString()).toBe(
      '2026-01-15T16:00:00.000Z',
    )
  })

  it('reads a wall time in daylight time', () => {
    expect(zonedTimeToUtc(civil(2026, 7, 15, 9), 'America/Denver').toISOString()).toBe(
      '2026-07-15T15:00:00.000Z',
    )
  })

  it('is correct on the day of a spring-forward transition, after the gap', () => {
    // US DST began 8 March 2026. 09:00 local that day is MDT, UTC-6.
    expect(zonedTimeToUtc(civil(2026, 3, 8, 9), 'America/Denver').toISOString()).toBe(
      '2026-03-08T15:00:00.000Z',
    )
  })

  it('is correct on the day of a fall-back transition', () => {
    // US DST ended 1 November 2026. 09:00 local that day is MST, UTC-7.
    expect(zonedTimeToUtc(civil(2026, 11, 1, 9), 'America/Denver').toISOString()).toBe(
      '2026-11-01T16:00:00.000Z',
    )
  })

  it('resolves a time inside the spring-forward gap to a defined instant', () => {
    // 02:30 on 8 March 2026 never happens in Denver: the clock jumps from 02:00
    // straight to 03:00. There is no right answer, only a defined one. Pinned
    // here so the behaviour cannot drift silently.
    const resolved = zonedTimeToUtc(civil(2026, 3, 8, 2, 30), 'America/Denver')
    expect(Number.isNaN(resolved.getTime())).toBe(false)
    expect(resolved.toISOString()).toBe('2026-03-08T08:30:00.000Z')
  })

  it('is unambiguous for a time inside the fall-back repeat, picking the first pass', () => {
    // 01:30 on 1 November 2026 happens twice in Denver, once at MDT and once at
    // MST. This picks the earlier one.
    expect(zonedTimeToUtc(civil(2026, 11, 1, 1, 30), 'America/Denver').toISOString()).toBe(
      '2026-11-01T07:30:00.000Z',
    )
  })

  it('round-trips a wall time through the offset it reports', () => {
    for (const zone of ['UTC', 'America/Denver', 'Europe/Dublin', 'Asia/Kolkata', 'Pacific/Auckland']) {
      const instant = zonedTimeToUtc(civil(2026, 6, 15, 14, 30), zone)
      const offset = tzOffsetMs(instant.getTime(), zone)
      expect(new Date(instant.getTime() + offset).toISOString()).toContain('T14:30:00')
    }
  })
})
