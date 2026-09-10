import { describe, expect, it } from 'vitest'
import { describeJsonError, escapeNonAsciiText, processJson, sortKeysDeep } from './json'

const opts = { indent: '2' as const, sortKeys: false, escapeNonAscii: false }

describe('processJson — pretty', () => {
  it('indents with the requested width', () => {
    const result = processJson('{"a":1,"b":[1,2]}', 'pretty', opts)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.output).toBe('{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}')
  })

  it('supports 4-space and tab indents', () => {
    const four = processJson('{"a":1}', 'pretty', { ...opts, indent: '4' })
    const tab = processJson('{"a":1}', 'pretty', { ...opts, indent: 'tab' })
    if (!four.ok || !tab.ok) throw new Error('expected success')
    expect(four.output).toBe('{\n    "a": 1\n}')
    expect(tab.output).toBe('{\n\t"a": 1\n}')
  })

  it('returns empty output for empty input, not an error', () => {
    const result = processJson('   ', 'pretty', opts)
    expect(result).toEqual({
      ok: true,
      output: '',
      stats: expect.objectContaining({ root: 'other' }),
    })
  })

  it('sorts keys recursively when asked', () => {
    const result = processJson('{"b":1,"a":{"z":1,"y":2}}', 'pretty', { ...opts, sortKeys: true })
    if (!result.ok) throw new Error('expected success')
    expect(result.output).toBe('{\n  "a": {\n    "y": 2,\n    "z": 1\n  },\n  "b": 1\n}')
  })

  it('escapes non-ASCII characters to \\uXXXX when asked', () => {
    const result = processJson('{"name":"héllo 🌍"}', 'pretty', { ...opts, escapeNonAscii: true })
    if (!result.ok) throw new Error('expected success')
    // The assertion is that nothing outside ASCII survived, control range
    // included, so the control character in the class is the point.
    // eslint-disable-next-line no-control-regex
    expect(result.output).not.toMatch(/[^\x00-\x7f]/)
    expect(result.output).toContain('\\u00e9') // é
  })

  it('reports byte size, depth, and container/key counts', () => {
    const result = processJson('{"a":{"b":[1,2,3]},"c":true}', 'pretty', opts)
    if (!result.ok) throw new Error('expected success')
    expect(result.stats.root).toBe('object')
    expect(result.stats.objectCount).toBe(2)
    expect(result.stats.arrayCount).toBe(1)
    expect(result.stats.keyCount).toBe(3) // a, c at depth 1; b at depth 2
    expect(result.stats.maxDepth).toBe(3) // outer object -> b's object -> the array
    expect(result.stats.bytesBefore).toBeGreaterThan(0)
    expect(result.stats.bytesAfter).toBeGreaterThan(result.stats.bytesBefore) // pretty-printing adds whitespace
  })

  it('identifies an array root', () => {
    const result = processJson('[1,2,3]', 'pretty', opts)
    if (!result.ok) throw new Error('expected success')
    expect(result.stats.root).toBe('array')
  })
})

describe('processJson — minify', () => {
  it('collapses whitespace', () => {
    const result = processJson('{\n  "a": 1,\n  "b": 2\n}', 'minify', opts)
    if (!result.ok) throw new Error('expected success')
    expect(result.output).toBe('{"a":1,"b":2}')
  })
})

describe('processJson — validate', () => {
  it('succeeds with stats and no rewritten output', () => {
    const result = processJson('{"a":1}', 'validate', opts)
    if (!result.ok) throw new Error('expected success')
    expect(result.output).toBe('')
    expect(result.stats.objectCount).toBe(1)
  })

  it('fails the same way pretty-print would on bad input', () => {
    const result = processJson('{"a":1,}', 'validate', opts)
    expect(result.ok).toBe(false)
  })
})

describe('describeJsonError — named causes', () => {
  it('names a trailing comma in an object', () => {
    const msg = fail('{"a":1,}')
    expect(msg).toMatch(/Trailing comma/)
    expect(msg).toMatch(/line 1, column 7/)
  })

  it('names a trailing comma in an array', () => {
    const msg = fail('[1,2,3,]')
    expect(msg).toMatch(/Trailing comma/)
  })

  it('names single quotes', () => {
    const msg = fail("{'a':1}")
    expect(msg).toMatch(/Single quotes/)
  })

  it('names an unquoted key', () => {
    const msg = fail('{a:1}')
    expect(msg).toMatch(/Unquoted key "a"/)
  })

  it('names a missing comma between object members', () => {
    const msg = fail('{"a":1 "b":2}')
    expect(msg).toMatch(/Missing comma/)
  })

  it('names a missing comma between array elements', () => {
    const msg = fail('[1 2]')
    expect(msg).toMatch(/Missing comma/)
  })

  it('names a line comment', () => {
    const msg = fail('{"a":1 // why\n}')
    expect(msg).toMatch(/comment/)
  })

  it('names a block comment', () => {
    const msg = fail('{/* hi */"a":1}')
    expect(msg).toMatch(/comment/)
  })

  it('names a NaN literal', () => {
    const msg = fail('{"a":NaN}')
    expect(msg).toMatch(/NaN.*not a valid JSON value/)
  })

  it('names an Infinity literal', () => {
    const msg = fail('{"a":Infinity}')
    expect(msg).toMatch(/Infinity.*not a valid JSON value/)
  })

  it('names an undefined literal', () => {
    const msg = fail('{"a":undefined}')
    expect(msg).toMatch(/undefined.*not a valid JSON value/)
  })

  it('names a raw newline inside a string', () => {
    const msg = fail('{"a":"line1\nline2"}')
    expect(msg).toMatch(/control character/)
  })

  it('names truncated input missing a closing brace', () => {
    const msg = fail('{"a":1')
    expect(msg).toMatch(/Truncated input/)
    expect(msg).toMatch(/"{"/)
  })

  it('names truncated input missing a closing bracket', () => {
    const msg = fail('[1,2,3')
    expect(msg).toMatch(/Truncated input/)
  })

  it('names an unterminated string', () => {
    const msg = fail('{"a":"unterminated')
    expect(msg).toMatch(/Truncated input/)
    expect(msg).toMatch(/never closed/)
  })

  it('always includes a line, column, and caret excerpt', () => {
    const msg = fail('{"a":1,}')
    expect(msg).toMatch(/line \d+, column \d+/)
    expect(msg).toContain('^')
  })
})

describe('describeJsonError — direct calls', () => {
  it('handles a caught error that is not an Error instance', () => {
    expect(describeJsonError('{}', 'boom')).toMatch(/boom/)
  })
})

describe('sortKeysDeep', () => {
  it('sorts nested object keys but leaves array order alone', () => {
    expect(sortKeysDeep({ b: 1, a: [3, 1, 2] })).toEqual({ a: [3, 1, 2], b: 1 })
  })

  it('leaves primitives untouched', () => {
    expect(sortKeysDeep(42)).toBe(42)
    expect(sortKeysDeep(null)).toBe(null)
  })
})

describe('escapeNonAsciiText', () => {
  it('leaves ASCII alone', () => {
    expect(escapeNonAsciiText('{"a":1}')).toBe('{"a":1}')
  })

  it('escapes a surrogate pair as two \\u sequences', () => {
    expect(escapeNonAsciiText('🌍')).toBe('\\ud83c\\udf0d')
  })
})

function fail(input: string): string {
  try {
    JSON.parse(input)
    throw new Error(`expected ${input} to fail parsing`)
  } catch (error) {
    return describeJsonError(input, error)
  }
}
