import { describe, expect, it } from 'vitest'
import { numberBetween, oneOf, shapeValidator, stringArrayOf } from './useShareState'

/**
 * Share state arrives from a URL, which is to say from whoever sent the link.
 * These tests are about what the validator refuses, not what it accepts.
 */
describe('shapeValidator', () => {
  interface State {
    input: string
    count: number
    wrap: boolean
    tags: string[]
  }

  const isState = shapeValidator<State>({
    input: 'string',
    count: 'number',
    wrap: 'boolean',
    tags: 'string[]',
  })

  it('accepts a payload of the right shape', () => {
    expect(isState({ input: 'a', count: 1, wrap: true, tags: ['x'] })).toBe(true)
  })

  it('accepts a partial payload, because defaults fill the rest', () => {
    expect(isState({ input: 'a' })).toBe(true)
    expect(isState({})).toBe(true)
  })

  it('rejects a field of the wrong type', () => {
    expect(isState({ count: '5' })).toBe(false)
    expect(isState({ wrap: 'yes' })).toBe(false)
    expect(isState({ tags: 'x' })).toBe(false)
    expect(isState({ tags: [1, 2] })).toBe(false)
  })

  it('rejects anything that is not a plain object', () => {
    expect(isState(null)).toBe(false)
    expect(isState([])).toBe(false)
    expect(isState('a')).toBe(false)
    expect(isState(3)).toBe(false)
  })

  it('ignores fields the shape does not mention', () => {
    expect(isState({ input: 'a', somethingElse: 99 })).toBe(true)
  })
})

describe('oneOf', () => {
  const isMethod = oneOf('GET', 'POST', 'DELETE')

  it('accepts a member', () => {
    expect(isMethod('POST')).toBe(true)
  })

  it('rejects a non-member, which is the case that matters', () => {
    // `fetch(url, { method })` accepts arbitrary tokens; a link should not be
    // able to choose one.
    expect(isMethod('TRACE')).toBe(false)
    expect(isMethod('post')).toBe(false)
    expect(isMethod('')).toBe(false)
  })

  it('rejects a non-string', () => {
    expect(isMethod(1)).toBe(false)
    expect(isMethod(null)).toBe(false)
  })
})

describe('numberBetween', () => {
  const isLength = numberBetween(1, 128)

  it('accepts the bounds themselves', () => {
    expect(isLength(1)).toBe(true)
    expect(isLength(128)).toBe(true)
  })

  it('rejects a value outside the range', () => {
    expect(isLength(0)).toBe(false)
    expect(isLength(100_000)).toBe(false)
    expect(isLength(-5)).toBe(false)
  })

  it('rejects NaN and Infinity, which JSON can carry as null but code can produce', () => {
    expect(isLength(Number.NaN)).toBe(false)
    expect(isLength(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('rejects a numeric string', () => {
    expect(isLength('64')).toBe(false)
  })
})

describe('stringArrayOf', () => {
  const isZones = stringArrayOf(8, 64)

  it('accepts a short array of short strings', () => {
    expect(isZones(['UTC', 'America/Denver'])).toBe(true)
    expect(isZones([])).toBe(true)
  })

  it('rejects an array longer than the cap', () => {
    expect(isZones(Array.from({ length: 9 }, () => 'UTC'))).toBe(false)
  })

  it('rejects an entry longer than the per-item cap', () => {
    expect(isZones(['x'.repeat(65)])).toBe(false)
  })

  it('rejects a non-array', () => {
    expect(isZones('UTC')).toBe(false)
  })
})
