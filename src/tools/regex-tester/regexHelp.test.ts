import { describe, expect, it } from 'vitest'
import { detectRisk, explainPattern } from './regexHelp'

describe('explainPattern', () => {
  it('describes a digit escape and a quantifier', () => {
    const tokens = explainPattern('\\d+')
    expect(tokens).toEqual([
      { token: '\\d', meaning: 'Digit (0-9)' },
      { token: '+', meaning: '1 or more of the preceding token' },
    ])
  })

  it('describes anchors around a character class with a range quantifier', () => {
    const tokens = explainPattern('^[a-z]{2,4}$')
    expect(tokens.map((t) => t.token)).toEqual(['^', '[a-z]', '{2,4}', '$'])
    expect(tokens[1]!.meaning).toBe('Any one of: a–z')
    expect(tokens[2]!.meaning).toBe('Between 2 and 4 of the preceding token')
  })

  it('describes a negated character class', () => {
    const tokens = explainPattern('[^0-9]')
    expect(tokens[0]!.meaning).toBe('Anything except: 0–9')
  })

  it('describes a non-capturing group and literal text', () => {
    const tokens = explainPattern('(?:abc)')
    expect(tokens.map((t) => t.token)).toEqual(['(?:', 'abc', ')'])
    expect(tokens[1]!.meaning).toBe('Literal text "abc"')
  })

  it('describes a named capturing group', () => {
    const tokens = explainPattern('(?<year>\\d{4})')
    expect(tokens[0]).toEqual({ token: '(?<year>', meaning: 'Named capturing group 1, "year"' })
    expect(tokens.map((t) => t.token)).toEqual(['(?<year>', '\\d', '{4}', ')'])
  })

  it('describes lookahead and lookbehind', () => {
    expect(explainPattern('(?=x)')[0]!.meaning).toContain('lookahead')
    expect(explainPattern('(?!x)')[0]!.meaning).toContain('NOT')
    expect(explainPattern('(?<=x)')[0]!.meaning).toContain('lookbehind')
    expect(explainPattern('(?<!x)')[0]!.meaning).toContain('NOT')
  })

  it('describes a lazy quantifier', () => {
    const tokens = explainPattern('a*?')
    expect(tokens[1]).toEqual({
      token: '*?',
      meaning: '0 or more of the preceding token, as few times as possible (lazy)',
    })
  })

  it('describes a numbered backreference', () => {
    const tokens = explainPattern('(a)\\1')
    expect(tokens[tokens.length - 1]).toEqual({
      token: '\\1',
      meaning: 'Backreference to capturing group 1',
    })
  })

  it('describes an escaped special character as a literal', () => {
    const tokens = explainPattern('\\.')
    expect(tokens[0]).toEqual({
      token: '\\.',
      meaning: 'Escaped literal "." — matches the character itself, not as a special one',
    })
  })

  it('returns nothing for an empty pattern', () => {
    expect(explainPattern('')).toEqual([])
  })

  it('numbers capturing groups in order, skipping non-capturing ones', () => {
    const tokens = explainPattern('(a)(?:b)(c)')
    const groupTokens = tokens.filter((t) => t.token === '(')
    expect(groupTokens.map((t) => t.meaning)).toEqual([
      'Capturing group 1 — remembers what it matches',
      'Capturing group 2 — remembers what it matches',
    ])
  })
})

describe('detectRisk', () => {
  it('flags (a+)+', () => {
    const warnings = detectRisk('(a+)+')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.message).toContain('Nested quantifier')
  })

  it('flags (a*)*', () => {
    expect(detectRisk('(a*)*')).toHaveLength(1)
  })

  it('flags (\\w+)*', () => {
    expect(detectRisk('(\\w+)*')).toHaveLength(1)
  })

  it('flags a {2,} spelling of the outer repetition', () => {
    expect(detectRisk('(a+){2,}')).toHaveLength(1)
  })

  it('does not flag a plain quantified group', () => {
    expect(detectRisk('(ab)+')).toHaveLength(0)
  })

  it('does not flag a group with no outer quantifier', () => {
    expect(detectRisk('(a+)')).toHaveLength(0)
  })

  it('does not flag a safe, common pattern', () => {
    expect(detectRisk('^\\d{3}-\\d{4}$')).toHaveLength(0)
  })

  it('does not flag an outer quantifier capped at one repeat', () => {
    expect(detectRisk('(a+)?')).toHaveLength(0)
  })

  it('returns nothing for an empty pattern', () => {
    expect(detectRisk('')).toEqual([])
  })
})
