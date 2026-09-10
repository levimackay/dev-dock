import { describe, expect, it } from 'vitest'
import { labelCronTokens, tokenizeCronInput } from './ruler'

describe('tokenizeCronInput', () => {
  it('locates each field by character offset', () => {
    const tokens = tokenizeCronInput('0 9 * * 1-5')
    expect(tokens).toEqual([
      { start: 0, end: 1, text: '0' },
      { start: 2, end: 3, text: '9' },
      { start: 4, end: 5, text: '*' },
      { start: 6, end: 7, text: '*' },
      { start: 8, end: 11, text: '1-5' },
    ])
  })

  it('is not thrown off by irregular whitespace between fields', () => {
    const tokens = tokenizeCronInput('0   9  *   *    1-5')
    expect(tokens.map((t) => t.text)).toEqual(['0', '9', '*', '*', '1-5'])
    expect(tokens[1]!.start).toBe(4) // the extra spaces really do shift it
  })

  it('accounts for leading whitespace', () => {
    const tokens = tokenizeCronInput('  0 9 * * *')
    expect(tokens[0]).toEqual({ start: 2, end: 3, text: '0' })
  })

  it('returns nothing for blank input', () => {
    expect(tokenizeCronInput('   ')).toEqual([])
  })
})

describe('labelCronTokens', () => {
  it('labels a five-field expression', () => {
    const labelled = labelCronTokens(tokenizeCronInput('0 9 * * 1-5'))
    expect(labelled.map((t) => t.field)).toEqual(['minute', 'hour', 'day of month', 'month', 'day of week'])
  })

  it('labels a six-field expression with a leading seconds column', () => {
    const labelled = labelCronTokens(tokenizeCronInput('30 0 9 * * *'))
    expect(labelled.map((t) => t.field)).toEqual([
      'second', 'minute', 'hour', 'day of month', 'month', 'day of week',
    ])
    expect(labelled[0]!.text).toBe('30')
  })

  it('keeps the offsets alongside the labels', () => {
    const labelled = labelCronTokens(tokenizeCronInput('0 9 * * 1-5'))
    expect(labelled[4]).toEqual({ start: 8, end: 11, text: '1-5', field: 'day of week' })
  })

  it('labels nothing for a macro (one token)', () => {
    expect(labelCronTokens(tokenizeCronInput('@daily'))).toEqual([])
  })

  it('labels nothing for a field count parseCron would itself reject', () => {
    expect(labelCronTokens(tokenizeCronInput('0 9 *'))).toEqual([])
  })
})
