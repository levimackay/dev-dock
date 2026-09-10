import { describe, expect, it } from 'vitest'
import {
  childEntries,
  containerPaths,
  isContainer,
  parentPath,
  parsePath,
  queryPath,
  searchTree,
  type JsonValue,
} from './tree'

const doc: JsonValue = {
  data: {
    items: [
      { name: 'first', tags: ['a', 'b'] },
      { name: 'second', tags: ['c'] },
    ],
    count: 2,
  },
  ok: true,
  note: null,
}

describe('parsePath', () => {
  it('parses a dotted path', () => {
    expect(parsePath('data.count')).toEqual({
      segments: [
        { type: 'key', key: 'data' },
        { type: 'key', key: 'count' },
      ],
    })
  })

  it('parses bracket indices', () => {
    expect(parsePath('data.items[0].name')).toEqual({
      segments: [
        { type: 'key', key: 'data' },
        { type: 'key', key: 'items' },
        { type: 'index', index: 0 },
        { type: 'key', key: 'name' },
      ],
    })
  })

  it('parses a wildcard segment written as [*]', () => {
    expect(parsePath('data.items[*].name')).toEqual({
      segments: [
        { type: 'key', key: 'data' },
        { type: 'key', key: 'items' },
        { type: 'wildcard' },
        { type: 'key', key: 'name' },
      ],
    })
  })

  it('parses a bare "*" segment', () => {
    expect(parsePath('*.name')).toEqual({
      segments: [{ type: 'wildcard' }, { type: 'key', key: 'name' }],
    })
  })

  it('strips a leading "$." the way JSONPath writes it', () => {
    expect(parsePath('$.data.count')).toEqual(parsePath('data.count'))
  })

  it('rejects an unclosed bracket', () => {
    const result = parsePath('data.items[0')
    expect('error' in result).toBe(true)
  })

  it('rejects a non-numeric, non-wildcard bracket', () => {
    const result = parsePath('data[abc]')
    expect('error' in result).toBe(true)
  })

  it('rejects an empty path', () => {
    expect('error' in parsePath('')).toBe(true)
    expect('error' in parsePath('   ')).toBe(true)
  })
})

describe('queryPath', () => {
  it('resolves a simple nested key', () => {
    const result = queryPath(doc, 'data.count')
    expect(result).toEqual({ ok: true, matches: [{ path: '$.data.count', value: 2 }] })
  })

  it('resolves through an array index', () => {
    const result = queryPath(doc, 'data.items[1].name')
    expect(result).toEqual({
      ok: true,
      matches: [{ path: '$.data.items[1].name', value: 'second' }],
    })
  })

  it('fans out over a wildcard array index', () => {
    const result = queryPath(doc, 'data.items[*].name')
    if (!result.ok) throw new Error('expected matches')
    expect(result.matches).toEqual([
      { path: '$.data.items[0].name', value: 'first' },
      { path: '$.data.items[1].name', value: 'second' },
    ])
  })

  it('fans out over a wildcard object key', () => {
    const result = queryPath({ a: { v: 1 }, b: { v: 2 } }, '*.v')
    if (!result.ok) throw new Error('expected matches')
    expect(result.matches).toEqual([
      { path: '$.a.v', value: 1 },
      { path: '$.b.v', value: 2 },
    ])
  })

  it('resolves the whole document for "$"', () => {
    expect(queryPath(doc, '$')).toEqual({ ok: true, matches: [{ path: '$', value: doc }] })
  })

  it('fails with an error, not a throw, on a missing key', () => {
    const result = queryPath(doc, 'data.missing')
    expect(result).toEqual({ ok: false, error: expect.stringContaining('data.missing') })
  })

  it('fails on an out-of-range index', () => {
    const result = queryPath(doc, 'data.items[9]')
    expect(result.ok).toBe(false)
  })

  it('fails on indexing into a non-array', () => {
    const result = queryPath(doc, 'data.count[0]')
    expect(result.ok).toBe(false)
  })

  it('propagates a parse error', () => {
    const result = queryPath(doc, 'data[')
    expect(result.ok).toBe(false)
  })
})

describe('parentPath', () => {
  it('strips a trailing key segment', () => {
    expect(parentPath('$.data.count')).toBe('$.data')
  })

  it('strips a trailing index segment', () => {
    expect(parentPath('$.data.items[0]')).toBe('$.data.items')
  })

  it('has no parent above the root', () => {
    expect(parentPath('$')).toBeUndefined()
  })

  it('goes straight to root from a top-level key', () => {
    expect(parentPath('$.data')).toBe('$')
  })
})

describe('searchTree', () => {
  it('matches on a key name', () => {
    const { matches } = searchTree(doc, 'count')
    expect(matches).toContainEqual({ path: '$.data.count', value: 2, matchedOn: 'key' })
  })

  it('matches on a scalar value substring, case-insensitively', () => {
    const { matches } = searchTree(doc, 'FIRST')
    expect(matches).toContainEqual({
      path: '$.data.items[0].name',
      value: 'first',
      matchedOn: 'value',
    })
  })

  it('matches "null" against a null value', () => {
    const { matches } = searchTree(doc, 'null')
    expect(matches).toContainEqual({ path: '$.note', value: null, matchedOn: 'value' })
  })

  it('returns nothing for an empty term', () => {
    expect(searchTree(doc, '')).toEqual({ matches: [], truncated: false })
  })

  it('caps results and reports truncation on a huge match set', () => {
    const big: JsonValue = { items: Array.from({ length: 700 }, (_, i) => `match-${i}`) }
    const { matches, truncated } = searchTree(big, 'match')
    expect(matches.length).toBeLessThanOrEqual(500)
    expect(truncated).toBe(true)
  })
})

describe('containerPaths', () => {
  it('includes only the root at depth 1', () => {
    expect(containerPaths(doc, 1)).toEqual(new Set(['$']))
  })

  it('includes containers down to the given depth, not scalars', () => {
    const paths = containerPaths(doc, 2)
    expect(paths).toEqual(new Set(['$', '$.data']))
  })

  it('reaches every container with no depth limit ("expand all")', () => {
    const paths = containerPaths(doc)
    expect(paths).toEqual(
      new Set([
        '$',
        '$.data',
        '$.data.items',
        '$.data.items[0]',
        '$.data.items[0].tags',
        '$.data.items[1]',
        '$.data.items[1].tags',
      ]),
    )
  })

  it('is empty for a scalar document — there is nothing to expand', () => {
    expect(containerPaths(42)).toEqual(new Set())
  })
})

describe('childEntries / isContainer', () => {
  it('lists array children by index', () => {
    expect(childEntries(['a', 'b'])).toEqual([
      { key: '0', value: 'a' },
      { key: '1', value: 'b' },
    ])
  })

  it('lists object children by key, in order', () => {
    expect(childEntries({ b: 1, a: 2 })).toEqual([
      { key: 'b', value: 1 },
      { key: 'a', value: 2 },
    ])
  })

  it('returns no children for a scalar', () => {
    expect(childEntries(42)).toEqual([])
    expect(childEntries(null)).toEqual([])
  })

  it('identifies containers vs scalars', () => {
    expect(isContainer({})).toBe(true)
    expect(isContainer([])).toBe(true)
    expect(isContainer(null)).toBe(false)
    expect(isContainer('x')).toBe(false)
  })
})

describe('deeply nested documents', () => {
  const deepArray = (levels: number): JsonValue => {
    let node: JsonValue = 1
    for (let i = 0; i < levels; i++) node = [node]
    return node
  }

  it('collects container paths on a document deeper than the call stack', () => {
    expect(() => containerPaths(deepArray(50000))).not.toThrow()
  })

  it('still respects an explicit maxDepth on a deep document', () => {
    expect(containerPaths(deepArray(50000), 2).size).toBe(2)
  })

  it('searches a deep document without overflowing, and says it truncated', () => {
    const outcome = searchTree(deepArray(50000), 'nothing-matches-this')
    expect(outcome.truncated).toBe(true)
  })

  it('resolves a path against a deep document without overflowing', () => {
    expect(() => queryPath(deepArray(50000), '$[0][0][0]')).not.toThrow()
  })
})
