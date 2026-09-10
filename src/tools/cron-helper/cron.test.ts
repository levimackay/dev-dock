import { describe, expect, it } from 'vitest'
import { describeCron, explainFields, matchesDay, nextRuns, parseCron } from './cron'

const parse = (text: string) => {
  const result = parseCron(text)
  if (!result.ok) throw new Error(`expected ${text} to parse: ${result.error.message}`)
  return result.expression
}

const failure = (text: string) => {
  const result = parseCron(text)
  if (result.ok) throw new Error(`expected ${text} to fail`)
  return result.error
}

describe('parseCron: accepting', () => {
  it('parses the all-wildcards expression', () => {
    const expr = parse('* * * * *')
    expect(expr.minutes.values).toHaveLength(60)
    expect(expr.hasSeconds).toBe(false)
  })

  it('parses a six-field expression as having seconds', () => {
    const expr = parse('30 0 9 * * *')
    expect(expr.hasSeconds).toBe(true)
    expect(expr.seconds.values).toEqual([30])
    expect(expr.hours.values).toEqual([9])
  })

  it('expands a step', () => {
    expect(parse('*/15 * * * *').minutes.values).toEqual([0, 15, 30, 45])
  })

  it('expands a range with a step', () => {
    expect(parse('0 9-17/4 * * *').hours.values).toEqual([9, 13, 17])
  })

  it('treats a bare value with a step as "from here onward"', () => {
    expect(parse('5/20 * * * *').minutes.values).toEqual([5, 25, 45])
  })

  it('expands a comma list', () => {
    expect(parse('0 0,6,12,18 * * *').hours.values).toEqual([0, 6, 12, 18])
  })

  it('accepts month names', () => {
    expect(parse('0 0 1 JAN,jul *').months.values).toEqual([1, 7])
  })

  it('accepts day names and ranges of them', () => {
    expect(parse('0 9 * * MON-FRI').daysOfWeek.values).toEqual([1, 2, 3, 4, 5])
  })

  it('normalises day 7 to day 0 for Sunday', () => {
    expect(parse('0 0 * * 7').daysOfWeek.values).toEqual([0])
  })

  it('accepts ? as a wildcard in the day fields', () => {
    expect(parse('0 0 ? * MON').daysOfMonth.wildcard).toBe(true)
  })

  it('expands @daily to midnight', () => {
    const expr = parse('@daily')
    expect(expr.hours.values).toEqual([0])
    expect(expr.minutes.values).toEqual([0])
  })

  it('expands @weekly to Sunday midnight', () => {
    expect(parse('@weekly').daysOfWeek.values).toEqual([0])
  })
})

describe('parseCron: rejecting', () => {
  it('rejects an empty expression with a usable hint', () => {
    expect(failure('').message).toMatch(/for example/)
  })

  it('rejects the wrong number of fields and says how many it found', () => {
    expect(failure('* * *').message).toMatch(/Found 3/)
  })

  it('names Quartz seven-field expressions specifically', () => {
    expect(failure('0 0 0 * * ? 2026').message).toMatch(/Quartz/)
  })

  it('names the L extension rather than mis-parsing it', () => {
    expect(failure('0 0 L * *').message).toMatch(/Quartz extension/)
  })

  it('rejects an out-of-range value naming the accepted range', () => {
    expect(failure('0 25 * * *').message).toMatch(/0-23/)
  })

  it('rejects a backwards range and suggests the fix', () => {
    expect(failure('0 17-9 * * *').message).toMatch(/runs backwards/)
  })

  it('rejects a zero step', () => {
    expect(failure('*/0 * * * *').message).toMatch(/never advance/)
  })

  it('rejects a non-numeric step', () => {
    expect(failure('*/x * * * *').message).toMatch(/not a step/)
  })

  it('rejects an unknown name', () => {
    expect(failure('0 0 * SMARCH *').message).toMatch(/not valid in the month field/)
  })

  it('names @every as a Go extension', () => {
    expect(failure('@every 5m').message).toMatch(/Go \(robfig\/cron\)/)
  })

  it('reports which field failed', () => {
    expect(failure('0 99 * * *').fieldIndex).toBe(1)
  })
})

describe('matchesDay: the either/both rule', () => {
  const monday = new Date(2026, 5, 1) // 1 June 2026 is a Monday
  const tuesday = new Date(2026, 5, 2)
  const laterMonday = new Date(2026, 5, 8)

  it('matches everything when both day fields are wildcards', () => {
    expect(matchesDay(parse('0 0 * * *'), tuesday, false)).toBe(true)
  })

  it('uses only day-of-week when day-of-month is a wildcard', () => {
    const expr = parse('0 0 * * MON')
    expect(matchesDay(expr, monday, false)).toBe(true)
    expect(matchesDay(expr, tuesday, false)).toBe(false)
  })

  it('uses only day-of-month when day-of-week is a wildcard', () => {
    const expr = parse('0 0 2 * *')
    expect(matchesDay(expr, tuesday, false)).toBe(true)
    expect(matchesDay(expr, monday, false)).toBe(false)
  })

  it('matches EITHER field when both are restricted', () => {
    const expr = parse('0 0 2 * MON')
    expect(matchesDay(expr, tuesday, false)).toBe(true) // the 2nd
    expect(matchesDay(expr, laterMonday, false)).toBe(true) // a Monday
    expect(matchesDay(expr, new Date(2026, 5, 3), false)).toBe(false) // neither
  })
})

describe('nextRuns', () => {
  const from = new Date(2026, 0, 1, 8, 30, 0) // Thu 1 Jan 2026, 08:30 local

  it('projects the next hourly runs', () => {
    const { runs } = nextRuns(parse('0 * * * *'), from, 3)
    expect(runs.map((d) => d.getHours())).toEqual([9, 10, 11])
    expect(runs.every((d) => d.getMinutes() === 0)).toBe(true)
  })

  it('never returns the starting instant itself', () => {
    const exact = new Date(2026, 0, 1, 9, 0, 0)
    const { runs } = nextRuns(parse('0 9 * * *'), exact, 1)
    expect(runs[0]!.getTime()).toBeGreaterThan(exact.getTime())
  })

  it('projects weekday-only schedules and skips the weekend', () => {
    // 2 Jan 2026 is a Friday, so the run after it is Monday the 5th.
    const { runs } = nextRuns(parse('0 9 * * MON-FRI'), new Date(2026, 0, 2, 10, 0), 1)
    expect(runs[0]!.getDate()).toBe(5)
  })

  it('projects a monthly schedule across a year boundary', () => {
    const { runs } = nextRuns(parse('0 0 1 * *'), new Date(2026, 11, 15), 2)
    expect(runs[0]!.getFullYear()).toBe(2027)
    expect(runs[0]!.getMonth()).toBe(0)
    expect(runs[1]!.getMonth()).toBe(1)
  })

  it('honours a seconds field', () => {
    const { runs } = nextRuns(parse('*/30 * * * * *'), new Date(2026, 0, 1, 0, 0, 5), 2)
    expect(runs.map((d) => d.getSeconds())).toEqual([30, 0])
  })

  it('reports exhaustion instead of spinning on an impossible date', () => {
    // 30 February never happens.
    const { runs, exhausted } = nextRuns(parse('0 0 30 2 *'), from, 1)
    expect(runs).toHaveLength(0)
    expect(exhausted).toBe(true)
  })

  it('computes in UTC when asked', () => {
    const { runs } = nextRuns(parse('0 0 * * *'), new Date('2026-06-01T12:00:00Z'), 1, true)
    expect(runs[0]!.toISOString()).toBe('2026-06-02T00:00:00.000Z')
  })
})

describe('describeCron', () => {
  it('describes the every-minute expression', () => {
    expect(describeCron(parse('* * * * *'))).toBe('Every minute.')
  })

  it('describes a single daily time as a clock time', () => {
    expect(describeCron(parse('30 9 * * *'))).toBe('At 09:30.')
  })

  it('describes several times on one line', () => {
    expect(describeCron(parse('0 9,17 * * *'))).toBe('At 09:00 and 17:00.')
  })

  it('describes a step', () => {
    expect(describeCron(parse('*/15 * * * *'))).toMatch(/every 15th minute/)
  })

  it('names weekdays in full', () => {
    expect(describeCron(parse('0 9 * * 1-5'))).toMatch(
      /Monday, Tuesday, Wednesday, Thursday, and Friday/,
    )
  })

  it('names months in full', () => {
    expect(describeCron(parse('0 0 1 1,7 *'))).toMatch(/January and July/)
  })

  it('spells out the either/both rule when both day fields are set', () => {
    expect(describeCron(parse('0 0 1 * MON'))).toMatch(/cron fires on days matching either/)
  })
})

describe('explainFields', () => {
  it('returns one row per field', () => {
    expect(explainFields(parse('0 9 * * 1-5'))).toHaveLength(5)
  })

  it('adds a seconds row for six-field expressions', () => {
    const rows = explainFields(parse('0 0 9 * * 1-5'))
    expect(rows).toHaveLength(6)
    expect(rows[0]!.field).toBe('Second')
  })

  it('keeps the raw text alongside the meaning', () => {
    const rows = explainFields(parse('*/5 9 * * *'))
    expect(rows[0]).toMatchObject({ field: 'Minute', raw: '*/5' })
  })
})
