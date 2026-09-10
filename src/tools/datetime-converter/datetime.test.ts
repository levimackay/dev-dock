import { describe, expect, it } from 'vitest'
import {
  durationBetween,
  parseFlexible,
  toEpochMillis,
  toEpochSeconds,
  toHttpDate,
  toHumanString,
  toIso8601,
  toIsoWeekDate,
  toRfc2822,
  toRfc3339,
  toSqlDatetime,
  zoneSnapshot,
  type ParseOptions,
} from './datetime'

const utcOptions: ParseOptions = { zone: 'UTC', dateOnlyAs: 'utc' }

describe('parseFlexible: "now"', () => {
  it('uses the injected clock rather than the real one', () => {
    const fixed = new Date('2026-05-01T00:00:00.000Z')
    const result = parseFlexible('now', { ...utcOptions, now: () => fixed })
    expect(result.ok).toBe(true)
    expect(result.ok && result.date.getTime()).toBe(fixed.getTime())
    expect(result.ok && result.format).toBe('now')
  })

  it('is case-insensitive', () => {
    expect(parseFlexible('NOW', { ...utcOptions, now: () => new Date(0) }).ok).toBe(true)
  })
})

describe('parseFlexible: the date-only ambiguity', () => {
  it('reads a bare date as UTC midnight when asked', () => {
    const result = parseFlexible('2026-03-15', { zone: 'America/New_York', dateOnlyAs: 'utc' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T00:00:00.000Z')
    expect(result.ok && result.dateOnly).toBe(true)
  })

  it('reads the same bare date as midnight in the given zone when asked', () => {
    // Jan is outside DST: America/New_York is UTC-5.
    const result = parseFlexible('2026-01-15', { zone: 'America/New_York', dateOnlyAs: 'zone' })
    expect(result.ok).toBe(true)
    expect(result.ok && result.date.toISOString()).toBe('2026-01-15T05:00:00.000Z')
  })

  it('flags a date-time input as unambiguous (not dateOnly), unlike a bare date', () => {
    const result = parseFlexible('2026-03-15T00:00', utcOptions)
    expect(result.ok && result.dateOnly).toBe(false)
  })
})

describe('parseFlexible: ISO 8601 date-time', () => {
  it('reads an offset-less date-time in the given zone', () => {
    const result = parseFlexible('2026-03-15T14:30:00', { zone: 'UTC', dateOnlyAs: 'utc' })
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T14:30:00.000Z')
  })

  it('accepts a space instead of "T"', () => {
    const result = parseFlexible('2026-03-15 14:30:00', utcOptions)
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T14:30:00.000Z')
  })

  it('honours an explicit Z regardless of the requested zone', () => {
    const result = parseFlexible('2026-03-15T14:30:00Z', { zone: 'Asia/Tokyo', dateOnlyAs: 'utc' })
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T14:30:00.000Z')
  })

  it('honours an explicit numeric offset regardless of the requested zone', () => {
    const result = parseFlexible('2026-03-15T14:30:00+05:30', { zone: 'UTC', dateOnlyAs: 'utc' })
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T09:00:00.000Z')
  })

  it('truncates a long fractional-second component to milliseconds', () => {
    const result = parseFlexible('2026-03-15T14:30:00.123456789Z', utcOptions)
    expect(result.ok && result.date.getUTCMilliseconds()).toBe(123)
  })

  it('rejects an out-of-range month', () => {
    const result = parseFlexible('2026-13-01', utcOptions)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/Month 13/)
  })

  it('rejects a day that does not exist in that month', () => {
    const result = parseFlexible('2026-02-30', utcOptions)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/no day 30/)
  })
})

describe('parseFlexible: RFC 2822', () => {
  it('parses a well-formed RFC 2822 string', () => {
    const result = parseFlexible('Mon, 15 Mar 2026 14:30:00 GMT', utcOptions)
    expect(result.ok).toBe(true)
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T14:30:00.000Z')
    expect(result.ok && result.format).toBe('rfc2822')
  })

  it('accepts a numeric offset', () => {
    const result = parseFlexible('15 Mar 2026 14:30:00 +0530', utcOptions)
    expect(result.ok && result.date.toISOString()).toBe('2026-03-15T09:00:00.000Z')
  })
})

describe('parseFlexible: epoch numbers', () => {
  it('treats a 10-digit number as seconds', () => {
    const result = parseFlexible('1700000000', utcOptions)
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_000)
    expect(result.ok && result.format).toBe('epoch')
  })

  it('treats a 13-digit number as milliseconds', () => {
    const result = parseFlexible('1700000000123', utcOptions)
    expect(result.ok && result.date.getTime()).toBe(1_700_000_000_123)
  })
})

describe('parseFlexible: failure modes', () => {
  it('rejects empty input', () => {
    expect(parseFlexible('', utcOptions).ok).toBe(false)
  })

  it('names what it could not recognise, and lists accepted formats', () => {
    const result = parseFlexible('banana', utcOptions)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toMatch(/Could not recognise/)
    expect(!result.ok && result.error).toMatch(/RFC 2822/)
  })
})

describe('output renderers', () => {
  const date = new Date('2026-03-15T14:30:00.123Z')

  it('renders ISO 8601 with and without milliseconds', () => {
    expect(toIso8601(date)).toBe('2026-03-15T14:30:00.123Z')
    expect(toIso8601(date, false)).toBe('2026-03-15T14:30:00Z')
  })

  it('renders RFC 2822 and RFC 3339', () => {
    expect(toRfc2822(date)).toBe('Sun, 15 Mar 2026 14:30:00 GMT')
    expect(toRfc3339(date)).toBe('2026-03-15T14:30:00.123Z')
  })

  it('renders an HTTP date identical to RFC 2822 here', () => {
    expect(toHttpDate(date)).toBe(toRfc2822(date))
  })

  it('renders SQL datetime in a given zone', () => {
    expect(toSqlDatetime(date, 'UTC')).toBe('2026-03-15 14:30:00')
  })

  it('renders epoch seconds and millis', () => {
    expect(toEpochSeconds(date)).toBe('1773585000')
    expect(toEpochMillis(date)).toBe('1773585000123')
  })

  it('renders a human string containing the year and weekday', () => {
    const human = toHumanString(date, 'UTC')
    expect(human).toContain('2026')
    expect(human).toContain('Sunday')
  })
})

describe('toIsoWeekDate', () => {
  it('matches the canonical 2005-01-01 example (belongs to week 53 of 2004)', () => {
    expect(toIsoWeekDate(new Date('2005-01-01T00:00:00Z'), 'UTC')).toBe('2004-W53-6')
  })

  it('matches the canonical 2007-01-01 example (a Monday, so week 1 day 1)', () => {
    expect(toIsoWeekDate(new Date('2007-01-01T00:00:00Z'), 'UTC')).toBe('2007-W01-1')
  })

  it('attributes a late-December date to the following ISO year when appropriate', () => {
    expect(toIsoWeekDate(new Date('2025-12-31T00:00:00Z'), 'UTC')).toBe('2026-W01-3')
  })
})

describe('zoneSnapshot', () => {
  it('reports zero offset and no DST for UTC', () => {
    const snap = zoneSnapshot(new Date('2026-06-01T00:00:00Z'), 'UTC')
    expect(snap.offset).toBe('+00:00')
    expect(snap.isDst).toBe(false)
  })

  it('reports a fixed offset with no DST for a zone that never observes it', () => {
    const snap = zoneSnapshot(new Date('2026-06-01T00:00:00Z'), 'Asia/Kolkata')
    expect(snap.offset).toBe('+05:30')
    expect(snap.isDst).toBe(false)
  })

  it('flags standard time in January and DST in July for America/New_York', () => {
    const jan = zoneSnapshot(new Date('2026-01-15T12:00:00Z'), 'America/New_York')
    const jul = zoneSnapshot(new Date('2026-07-15T12:00:00Z'), 'America/New_York')
    expect(jan.offset).toBe('-05:00')
    expect(jan.isDst).toBe(false)
    expect(jul.offset).toBe('-04:00')
    expect(jul.isDst).toBe(true)
  })
})

describe('durationBetween', () => {
  it('breaks down a simple same-month-boundary span', () => {
    const from = new Date('1970-01-01T00:00:00Z')
    const to = new Date('1970-01-02T01:01:01Z')
    const d = durationBetween(from, to)
    expect(d).toMatchObject({
      years: 0,
      months: 0,
      days: 1,
      hours: 1,
      minutes: 1,
      seconds: 1,
      negative: false,
    })
    expect(d.totalDays).toBe(1)
  })

  it('breaks down a span crossing a year and two months with no borrowing', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date('2027-03-05T00:00:00Z')
    expect(durationBetween(from, to)).toMatchObject({ years: 1, months: 2, days: 4 })
  })

  it('borrows days from the shorter preceding month', () => {
    const from = new Date('2026-01-10T00:00:00Z')
    const to = new Date('2026-03-05T00:00:00Z')
    // Jan 10 + 1 month = Feb 10; Feb 2026 has 28 days, so 23 more days reaches Mar 5.
    expect(durationBetween(from, to)).toMatchObject({ years: 0, months: 1, days: 23 })
  })

  it('is order-independent for the field breakdown but flags direction', () => {
    const a = new Date('2026-01-01T00:00:00Z')
    const b = new Date('2026-01-02T00:00:00Z')
    const forward = durationBetween(a, b)
    const backward = durationBetween(b, a)
    expect(backward.negative).toBe(true)
    expect(forward.negative).toBe(false)
    expect(backward.days).toBe(forward.days)
  })
})
