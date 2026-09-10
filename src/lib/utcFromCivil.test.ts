import { describe, expect, it } from 'vitest'
import { utcFromCivil } from './utcFromCivil'

const iso = (ms: number) => new Date(ms).toISOString()

describe('utcFromCivil', () => {
  it('agrees with Date.UTC for ordinary years', () => {
    expect(utcFromCivil(2026, 8, 9)).toBe(Date.UTC(2026, 8, 9))
  })

  it('takes a two-digit year literally, where Date.UTC would not', () => {
    expect(Date.UTC(50, 2, 15)).toBe(new Date('1950-03-15T00:00:00Z').getTime())
    expect(iso(utcFromCivil(50, 2, 15))).toBe('0050-03-15T00:00:00.000Z')
  })

  it('handles year 0', () => {
    expect(iso(utcFromCivil(0, 0, 1))).toBe('0000-01-01T00:00:00.000Z')
  })

  it('handles year 99, the last remapped year', () => {
    expect(iso(utcFromCivil(99, 11, 31))).toBe('0099-12-31T00:00:00.000Z')
  })

  it('handles year 100, the first year Date.UTC gets right', () => {
    expect(iso(utcFromCivil(100, 0, 1))).toBe('0100-01-01T00:00:00.000Z')
  })

  it('carries the time components through', () => {
    expect(iso(utcFromCivil(50, 5, 2, 13, 45, 30, 250))).toBe('0050-06-02T13:45:30.250Z')
  })

  it('leaves negative years to Date.UTC, which handles them correctly', () => {
    expect(utcFromCivil(-1, 0, 1)).toBe(Date.UTC(-1, 0, 1))
  })

  it('propagates an out-of-range result as NaN rather than inventing one', () => {
    expect(Number.isNaN(utcFromCivil(300000, 0, 1))).toBe(true)
  })
})
