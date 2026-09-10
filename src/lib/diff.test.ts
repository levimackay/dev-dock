import { describe, expect, it } from 'vitest'
import {
  diffLines,
  diffSequences,
  diffWords,
  splitLines,
  tokenizeWords,
  toUnifiedDiff,
} from './diff'

const ops = (chunks: ReturnType<typeof diffSequences>) =>
  chunks?.map((chunk) => `${chunk.op[0]}${chunk.values.join('')}`)

describe('diffSequences', () => {
  it('reports two identical sequences as one equal chunk', () => {
    expect(ops(diffSequences(['a', 'b'], ['a', 'b']))).toEqual(['eab'])
  })

  it('handles an empty left side as a pure insert', () => {
    expect(ops(diffSequences([], ['a', 'b']))).toEqual(['iab'])
  })

  it('handles an empty right side as a pure delete', () => {
    expect(ops(diffSequences(['a', 'b'], []))).toEqual(['dab'])
  })

  it('returns nothing for two empty sequences', () => {
    expect(diffSequences([], [])).toEqual([])
  })

  it('finds a single insertion in the middle', () => {
    expect(ops(diffSequences(['a', 'c'], ['a', 'b', 'c']))).toEqual(['ea', 'ib', 'ec'])
  })

  it('finds a single deletion in the middle', () => {
    expect(ops(diffSequences(['a', 'b', 'c'], ['a', 'c']))).toEqual(['ea', 'db', 'ec'])
  })

  it('produces a minimal script for the classic ABCABBA/CBABAC case', () => {
    const chunks = diffSequences('ABCABBA'.split(''), 'CBABAC'.split(''))!
    const edits = chunks
      .filter((c) => c.op !== 'equal')
      .reduce((sum, c) => sum + c.values.length, 0)
    // Myers' own example: the shortest edit script has length 5.
    expect(edits).toBe(5)
  })

  it('reconstructs the right-hand sequence from the chunks', () => {
    const a = 'the quick brown fox'.split(' ')
    const b = 'the slow brown dog jumps'.split(' ')
    const rebuilt = diffSequences(a, b)!
      .filter((c) => c.op !== 'delete')
      .flatMap((c) => c.values)
    expect(rebuilt).toEqual(b)
  })

  it('reconstructs the left-hand sequence from the chunks', () => {
    const a = 'the quick brown fox'.split(' ')
    const b = 'the slow brown dog jumps'.split(' ')
    const rebuilt = diffSequences(a, b)!
      .filter((c) => c.op !== 'insert')
      .flatMap((c) => c.values)
    expect(rebuilt).toEqual(a)
  })

  it('stays cheap when a long common prefix and suffix surround one change', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `line ${i}`)
    const b = [...a]
    b[2000] = 'changed'
    const started = performance.now()
    const chunks = diffSequences(a, b)
    expect(chunks).not.toBeNull()
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('returns null instead of hanging when the edit distance exceeds the ceiling', () => {
    const a = Array.from({ length: 400 }, (_, i) => `a${i}`)
    const b = Array.from({ length: 400 }, (_, i) => `b${i}`)
    expect(diffSequences(a, b, 20)).toBeNull()
  })
})

describe('splitLines', () => {
  it('returns no lines for empty text', () => {
    expect(splitLines('')).toEqual([])
  })

  it('splits on LF, CRLF, and bare CR alike', () => {
    expect(splitLines('a\nb\r\nc\rd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps a trailing empty line', () => {
    expect(splitLines('a\n')).toEqual(['a', ''])
  })
})

describe('diffLines', () => {
  it('numbers lines on both sides', () => {
    const { lines } = diffLines('a\nb\nc', 'a\nx\nc')
    expect(lines.map((l) => [l.op, l.leftNo, l.rightNo])).toEqual([
      ['equal', 1, 1],
      ['delete', 2, null],
      ['insert', null, 2],
      ['equal', 3, 3],
    ])
  })

  it('counts additions, removals, and unchanged lines', () => {
    const result = diffLines('a\nb\nc', 'a\nx\ny\nc')
    expect(result.added).toBe(2)
    expect(result.removed).toBe(1)
    expect(result.unchanged).toBe(2)
  })

  it('ignores whitespace when asked', () => {
    const strict = diffLines('a  b', 'a b')
    const loose = diffLines('a  b', 'a b', { ignoreWhitespace: true })
    expect(strict.added).toBe(1)
    expect(loose.added).toBe(0)
  })

  it('ignores case when asked', () => {
    expect(diffLines('Hello', 'hello', { ignoreCase: true }).added).toBe(0)
  })

  it('emits the original text even when comparing normalised keys', () => {
    const { lines } = diffLines('A  B', 'A  B', { ignoreWhitespace: true })
    expect(lines[0]!.text).toBe('A  B')
  })

  it('degrades to whole-file replacement past the ceiling and says so', () => {
    const a = Array.from({ length: 200 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 200 }, (_, i) => `b${i}`).join('\n')
    const result = diffLines(a, b, { maxEditDistance: 10 })
    expect(result.degraded).toBe(true)
    expect(result.unchanged).toBe(0)
  })
})

describe('tokenizeWords', () => {
  it('keeps whitespace as its own token', () => {
    expect(tokenizeWords('a b')).toEqual(['a', ' ', 'b'])
  })

  it('splits punctuation from words', () => {
    expect(tokenizeWords('foo(bar)')).toEqual(['foo', '(', 'bar', ')'])
  })
})

describe('diffWords', () => {
  it('highlights only the word that changed', () => {
    const spans = diffWords('the quick fox', 'the slow fox')
    expect(spans.filter((s) => s.op === 'delete').map((s) => s.text)).toEqual(['quick'])
    expect(spans.filter((s) => s.op === 'insert').map((s) => s.text)).toEqual(['slow'])
  })

  it('rebuilds both sides exactly', () => {
    const spans = diffWords('alpha, beta', 'alpha; gamma')
    expect(
      spans
        .filter((s) => s.op !== 'insert')
        .map((s) => s.text)
        .join(''),
    ).toBe('alpha, beta')
    expect(
      spans
        .filter((s) => s.op !== 'delete')
        .map((s) => s.text)
        .join(''),
    ).toBe('alpha; gamma')
  })
})

describe('toUnifiedDiff', () => {
  it('returns an empty string when nothing changed', () => {
    expect(toUnifiedDiff('same', 'same')).toBe('')
  })

  it('writes a header and a hunk with markers', () => {
    const patch = toUnifiedDiff('a\nb\nc', 'a\nx\nc', { leftName: 'old.txt', rightName: 'new.txt' })
    expect(patch).toContain('--- old.txt')
    expect(patch).toContain('+++ new.txt')
    expect(patch).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m)
    expect(patch).toContain('-b')
    expect(patch).toContain('+x')
    expect(patch).toContain(' a')
  })

  it('merges two nearby changes into one hunk', () => {
    const left = ['1', '2', '3', '4', '5', '6'].join('\n')
    const right = ['1', 'x', '3', '4', 'y', '6'].join('\n')
    const hunks = toUnifiedDiff(left, right, { context: 3 }).match(/^@@/gm) ?? []
    expect(hunks).toHaveLength(1)
  })

  it('keeps distant changes in separate hunks', () => {
    const left = Array.from({ length: 40 }, (_, i) => String(i)).join('\n')
    const rightLines = Array.from({ length: 40 }, (_, i) => String(i))
    rightLines[1] = 'x'
    rightLines[35] = 'y'
    const hunks = toUnifiedDiff(left, rightLines.join('\n'), { context: 3 }).match(/^@@/gm) ?? []
    expect(hunks).toHaveLength(2)
  })
})
