import { describe, expect, it } from 'vitest'
import { diffLines } from '@/lib/diff'
import { similarityPercent } from './textdiff'

describe('similarityPercent', () => {
  it('is 100 for two empty inputs', () => {
    expect(similarityPercent(diffLines('', ''))).toBe(100)
  })

  it('is 100 for identical text', () => {
    expect(similarityPercent(diffLines('a\nb\nc', 'a\nb\nc'))).toBe(100)
  })

  it('is 0 when nothing matches', () => {
    expect(similarityPercent(diffLines('a\nb', 'x\ny'))).toBe(0)
  })

  it('reflects a partial match', () => {
    // 2 of 3 lines unchanged (a, c) against a total of 4 (a, b removed, x
    // inserted, c) -> 2/4 = 50%.
    const result = diffLines('a\nb\nc', 'a\nx\nc')
    expect(similarityPercent(result)).toBe(50)
  })
})
