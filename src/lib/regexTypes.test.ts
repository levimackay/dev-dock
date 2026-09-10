import { describe, expect, it } from 'vitest'
import { executeRegex, type RegexRequest } from './regexTypes'

const req = (partial: Partial<RegexRequest>): RegexRequest => ({
  id: 1,
  pattern: '',
  flags: '',
  text: '',
  maxMatches: 1000,
  ...partial,
})

describe('executeRegex', () => {
  it('reports a syntax error instead of throwing', () => {
    const result = executeRegex(req({ pattern: '(' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('syntax')
  })

  it('rejects an unknown flag as a syntax error', () => {
    const result = executeRegex(req({ pattern: 'a', flags: 'q' }))
    expect(result.ok).toBe(false)
  })

  it('returns the first match only without the global flag', () => {
    const result = executeRegex(req({ pattern: 'a', text: 'aaa' }))
    expect(result.ok && result.matches).toHaveLength(1)
  })

  it('returns every match with the global flag', () => {
    const result = executeRegex(req({ pattern: 'a', flags: 'g', text: 'aaa' }))
    expect(result.ok && result.matches).toHaveLength(3)
  })

  it('reports capture group contents and positions', () => {
    const result = executeRegex(req({ pattern: '(\\d+)-(\\d+)', text: 'id 12-34 end' }))
    expect(result.ok && result.matches[0]).toMatchObject({
      index: 3,
      text: '12-34',
      groups: ['12', '34'],
    })
  })

  it('reports named groups', () => {
    const result = executeRegex(req({ pattern: '(?<year>\\d{4})', text: 'in 1999' }))
    expect(result.ok && result.matches[0]?.named).toEqual({ year: '1999' })
  })

  it('does not loop forever on a zero-length global match', () => {
    const result = executeRegex(req({ pattern: 'a*', flags: 'g', text: 'bbb', maxMatches: 50 }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.matches.length).toBeLessThanOrEqual(5)
  })

  it('truncates at maxMatches and says so', () => {
    const result = executeRegex(req({ pattern: '.', flags: 'g', text: 'x'.repeat(50), maxMatches: 10 }))
    expect(result.ok && result.matches).toHaveLength(10)
    expect(result.ok && result.truncated).toBe(true)
  })

  it('computes a replacement across all matches even without the g flag', () => {
    const result = executeRegex(req({ pattern: 'a', text: 'aaa', replacement: 'b' }))
    expect(result.ok && result.replaced).toBe('bbb')
  })

  it('supports $1 references in the replacement', () => {
    const result = executeRegex(
      req({ pattern: '(\\w+)@(\\w+)', text: 'me@here', replacement: '$2:$1' }),
    )
    expect(result.ok && result.replaced).toBe('here:me')
  })

  it('returns no matches for an empty subject', () => {
    const result = executeRegex(req({ pattern: 'a', flags: 'g', text: '' }))
    expect(result.ok && result.matches).toHaveLength(0)
  })
})
