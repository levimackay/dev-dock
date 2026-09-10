import { describe, expect, it } from 'vitest'
import { fuzzyMatch, fuzzyScoreFields } from './fuzzy'

describe('fuzzyMatch', () => {
  it('returns a neutral match for an empty query', () => {
    expect(fuzzyMatch('JSON Formatter', '')).toEqual({ score: 1, indices: [] })
  })

  it('returns null when a character is missing', () => {
    expect(fuzzyMatch('JSON Formatter', 'xyz')).toBeNull()
  })

  it('returns null for any query against an empty haystack', () => {
    expect(fuzzyMatch('', 'a')).toBeNull()
  })

  it('matches a case-insensitive substring and reports its indices', () => {
    expect(fuzzyMatch('JSON Formatter', 'form')?.indices).toEqual([5, 6, 7, 8])
  })

  it('matches a scattered subsequence', () => {
    const result = fuzzyMatch('JSON Formatter', 'jfmt')
    expect(result).not.toBeNull()
    expect(result!.indices).toEqual([0, 5, 8, 10])
  })

  it('ranks a prefix match above a mid-string match', () => {
    const prefix = fuzzyMatch('Base64', 'base')!.score
    const middle = fuzzyMatch('Decode Base64', 'base')!.score
    expect(prefix).toBeGreaterThan(middle)
  })

  it('ranks word-boundary initials above scattered letters', () => {
    const initials = fuzzyMatch('JSON Formatter', 'jf')!.score
    const scattered = fuzzyMatch('Jiffy staff', 'jf')!.score
    expect(initials).toBeGreaterThan(scattered)
  })

  it('ranks a shorter haystack above a longer one for the same query', () => {
    const short = fuzzyMatch('Base64', 'base64')!.score
    const long = fuzzyMatch('Base64 and friends forever', 'base64')!.score
    expect(short).toBeGreaterThan(long)
  })

  it('treats camelCase transitions as boundaries', () => {
    const camel = fuzzyMatch('parseJsonBody', 'pjb')!.score
    const noise = fuzzyMatch('pilot jumbo bandage x y z q', 'pjb')!.score
    expect(camel).toBeGreaterThan(noise)
  })

  it('ignores spaces in the query so "json f" still matches', () => {
    expect(fuzzyMatch('JSON Formatter', 'json f')).not.toBeNull()
  })
})

describe('fuzzyScoreFields', () => {
  const fields = (name: string, keywords: string) => [
    { text: name, weight: 1 },
    { text: keywords, weight: 0.5 },
  ]

  it('returns null when no field matches', () => {
    expect(fuzzyScoreFields(fields('UUID', 'guid random'), 'zzz')).toBeNull()
  })

  it('matches on a secondary field when the primary misses', () => {
    const result = fuzzyScoreFields(fields('UUID Generator', 'guid random nanoid'), 'nanoid')
    expect(result).not.toBeNull()
  })

  it('prefers a primary-field hit over an equal secondary-field hit', () => {
    const onName = fuzzyScoreFields(fields('Hash Generator', 'x'), 'hash')!.score
    const onKeywords = fuzzyScoreFields(fields('Digest Maker', 'hash'), 'hash')!.score
    expect(onName).toBeGreaterThan(onKeywords)
  })

  it('only reports highlight indices from the primary field', () => {
    const result = fuzzyScoreFields(fields('UUID Generator', 'nanoid'), 'nanoid')
    expect(result!.indices).toEqual([])
  })
})
