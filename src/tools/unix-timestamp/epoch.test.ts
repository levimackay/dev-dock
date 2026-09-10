import { describe, expect, it } from 'vitest'
import {
  dayOfWeek,
  detectUnit,
  formatInZone,
  formatRelative,
  fromDate,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
  toInstant,
  toIso8601,
  toRfc2822,
  toRfc3339,
  zonedTimeToUtc,
} from './epoch'

describe('detectUnit', () => {
  it('picks seconds for a 10-digit "now"-sized value', () => {
    expect(detectUnit('1700000000')).toBe('seconds')
  })

  it('picks milliseconds for a 13-digit value', () => {
    expect(detectUnit('1700000000000')).toBe('milliseconds')
  })

  it('picks microseconds for a 16-digit value', () => {
    expect(detectUnit('1700000000000000')).toBe('microseconds')
  })

  it('picks nanoseconds for a 19-digit value', () => {
    expect(detectUnit('1700000000000000000')).toBe('nanoseconds')
  })

  it('ignores a sign and a fractional part when counting digits', () => {
    expect(detectUnit('-1700000000.999')).toBe('seconds')
  })

  it('treats a short or empty value as seconds by default', () => {
    expect(detectUnit('0')).toBe('seconds')
    expect(detectUnit('')).toBe('seconds')
  })
})

describe('toInstant', () => {
  it('parses zero as the epoch', () => {
    const result = toInstant('0', 'seconds')
    expect(result.ok).toBe(true)
    expect(result.date?.toISOString()).toBe('1970-01-01T00:00:00.000Z')
  })

  it('parses milliseconds directly', () => {
    const result = toInstant('1700000000123', 'milliseconds')
    expect(result.date?.toISOString()).toBe('2023-11-14T22:13:20.123Z')
  })

  it('parses fractional seconds down to millisecond precision', () => {
    const result = toInstant('1.5', 'seconds')
    expect(result.date?.toISOString()).toBe('1970-01-01T00:00:01.500Z')
  })

  it('handles a negative (pre-1970) timestamp', () => {
    const result = toInstant('-86400', 'seconds')
    expect(result.ok).toBe(true)
    expect(result.date?.toISOString()).toBe('1969-12-31T00:00:00.000Z')
  })

  it('handles nanoseconds beyond Number.MAX_SAFE_INTEGER without losing precision', () => {
    // 1,700,000,000,123,000,000 ns = 1700000000123 ms exactly.
    const result = toInstant('1700000000123000000', 'nanoseconds')
    expect(result.date?.getTime()).toBe(1700000000123)
  })

  it('rejects non-numeric input by name', () => {
    const result = toInstant('not-a-number', 'seconds')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/not a timestamp/)
  })

  it('rejects empty input', () => {
    expect(toInstant('', 'seconds').error).toMatch(/Enter a timestamp/)
  })

  it('reports the JS Date limit instead of producing Invalid Date', () => {
    const result = toInstant('999999999999999999', 'seconds')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/outside what JS `Date` can represent/)
  })

  it('flags a value within 90 days of the 2038 signed-32-bit rollover', () => {
    expect(toInstant('2147483647', 'seconds').near2038).toBe(true)
    expect(toInstant('2000000000', 'seconds').near2038).toBe(false)
  })
})

describe('fromDate', () => {
  it('round-trips the epoch', () => {
    expect(fromDate(new Date(0))).toEqual({
      seconds: '0',
      milliseconds: '0',
      microseconds: '0',
      nanoseconds: '0',
    })
  })

  it('renders a real instant in all four units', () => {
    const values = fromDate(new Date(1700000000123))
    expect(values.milliseconds).toBe('1700000000123')
    expect(values.seconds).toBe('1700000000')
    expect(values.microseconds).toBe('1700000000123000')
    expect(values.nanoseconds).toBe('1700000000123000000')
  })

  it('round-trips through toInstant for a nanosecond-precision value', () => {
    const original = new Date(1700000000123)
    const values = fromDate(original)
    const back = toInstant(values.nanoseconds, 'nanoseconds')
    expect(back.date?.getTime()).toBe(original.getTime())
  })
})

describe('formatRelative', () => {
  const now = new Date(2026, 0, 10, 12, 0, 0)

  it('says "just now" for anything under 5 seconds', () => {
    expect(formatRelative(new Date(now.getTime() - 2000), now)).toBe('just now')
  })

  it('describes the past', () => {
    expect(formatRelative(new Date(now.getTime() - 3_600_000), now)).toBe('1 hour ago')
  })

  it('describes the future', () => {
    expect(formatRelative(new Date(now.getTime() + 2 * 86_400_000), now)).toBe('in 2 days')
  })

  it('pluralises correctly at the unit boundary', () => {
    expect(formatRelative(new Date(now.getTime() - 60_000), now)).toBe('1 minute ago')
    expect(formatRelative(new Date(now.getTime() - 120_000), now)).toBe('2 minutes ago')
  })
})

describe('format renderers', () => {
  it('renders RFC 2822', () => {
    expect(toRfc2822(new Date(0))).toBe('Thu, 01 Jan 1970 00:00:00 GMT')
  })

  it('renders ISO 8601 and RFC 3339 identically for a UTC instant', () => {
    expect(toIso8601(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
    expect(toRfc3339(new Date(0))).toBe('1970-01-01T00:00:00.000Z')
  })

  it('reports the day of week in a given zone, independent of machine tz', () => {
    expect(dayOfWeek(new Date(0), 'UTC')).toBe('Thursday')
  })

  it('formats an instant in an explicit zone', () => {
    const rendered = formatInZone(new Date(0), 'UTC')
    expect(rendered).toContain('1970')
    expect(rendered).toContain('UTC')
  })
})

describe('zonedTimeToUtc', () => {
  it('treats UTC fields as already being UTC', () => {
    const date = zonedTimeToUtc(
      { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      'UTC',
    )
    expect(date.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('applies standard-time offset outside DST', () => {
    // Jan 1 2026 is outside DST: America/New_York is UTC-5.
    const date = zonedTimeToUtc(
      { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 },
      'America/New_York',
    )
    expect(date.toISOString()).toBe('2026-01-01T05:00:00.000Z')
  })

  it('applies daylight-saving offset inside DST', () => {
    // Jul 1 2026 is inside DST: America/New_York is UTC-4.
    const date = zonedTimeToUtc(
      { year: 2026, month: 7, day: 1, hour: 0, minute: 0, second: 0 },
      'America/New_York',
    )
    expect(date.toISOString()).toBe('2026-07-01T04:00:00.000Z')
  })
})

describe('parseDatetimeLocalValue', () => {
  it('parses the minute-precision form the native input emits by default', () => {
    expect(parseDatetimeLocalValue('2026-01-01T00:00')).toEqual({
      year: 2026,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
      second: 0,
    })
  })

  it('parses the seconds-precision form', () => {
    expect(parseDatetimeLocalValue('2026-01-01T00:00:45')).toMatchObject({ second: 45 })
  })

  it('rejects a malformed value', () => {
    expect(parseDatetimeLocalValue('not a date')).toBeUndefined()
  })
})

describe('toDatetimeLocalValue', () => {
  it('round-trips through parseDatetimeLocalValue via zonedTimeToUtc', () => {
    const original = new Date('2026-06-15T14:30:00.000Z')
    const value = toDatetimeLocalValue(original, 'UTC')
    expect(value).toBe('2026-06-15T14:30:00')
    const fields = parseDatetimeLocalValue(value)!
    expect(zonedTimeToUtc(fields, 'UTC').getTime()).toBe(original.getTime())
  })
})
