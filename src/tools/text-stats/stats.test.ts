import { describe, expect, it } from 'vitest'
import {
  characterClassCounts,
  characterFrequency,
  countCharacters,
  countLines,
  countParagraphs,
  countSentences,
  countSyllables,
  countUniqueWords,
  countWords,
  fleschKincaidGrade,
  fleschReadingEase,
  longestWords,
  readingEaseBand,
  readingTimeMinutes,
  speakingTimeMinutes,
  wordFrequency,
} from './stats'

describe('countWords', () => {
  it('counts words separated by whitespace and punctuation', () => {
    expect(countWords('The quick brown fox.')).toBe(4)
  })

  it('is 0 for empty input', () => {
    expect(countWords('')).toBe(0)
  })

  it('counts a contraction as one word', () => {
    expect(countWords("don't stop")).toBe(2)
  })
})

describe('countUniqueWords', () => {
  it('is case-insensitive', () => {
    expect(countUniqueWords('The the THE cat')).toBe(2)
  })

  it('is 0 for empty input', () => {
    expect(countUniqueWords('')).toBe(0)
  })
})

describe('countCharacters', () => {
  it('counts with and without spaces', () => {
    expect(countCharacters('a b c')).toEqual({ withSpaces: 5, withoutSpaces: 3 })
  })

  it('handles empty input', () => {
    expect(countCharacters('')).toEqual({ withSpaces: 0, withoutSpaces: 0 })
  })
})

describe('countSentences', () => {
  it('counts sentences ending in . ! or ?', () => {
    expect(countSentences('Hello world. This is great! Right?')).toBe(3)
  })

  it('is 0 for empty input', () => {
    expect(countSentences('')).toBe(0)
  })

  it('counts text with no terminal punctuation as one sentence', () => {
    expect(countSentences('just a fragment')).toBe(1)
  })

  it('does not count trailing whitespace-only content as a sentence', () => {
    expect(countSentences('One sentence.   ')).toBe(1)
  })
})

describe('countParagraphs', () => {
  it('splits on blank lines', () => {
    expect(countParagraphs('one\n\ntwo\n\nthree')).toBe(3)
  })

  it('treats a single block as one paragraph', () => {
    expect(countParagraphs('line one\nline two')).toBe(1)
  })

  it('is 0 for empty input', () => {
    expect(countParagraphs('')).toBe(0)
  })
})

describe('countLines', () => {
  it('counts newline-separated lines', () => {
    expect(countLines('a\nb\nc')).toBe(3)
  })

  it('is 0 for empty input', () => {
    expect(countLines('')).toBe(0)
  })
})

describe('countSyllables', () => {
  it.each([
    ['cat', 1],
    ['the', 1],
    ['hello', 2],
    ['table', 2],
    ['little', 2],
    ['make', 1],
    ['banana', 3],
    ['walked', 1],
    ['wanted', 2],
  ])('%s -> %i', (word, expected) => {
    expect(countSyllables(word)).toBe(expected)
  })

  it('returns 0 for input with no letters', () => {
    expect(countSyllables('123')).toBe(0)
  })

  it('never returns less than 1 for a real word', () => {
    expect(countSyllables('a')).toBeGreaterThanOrEqual(1)
  })
})

describe('readability', () => {
  it('is 0 when there are no words or sentences', () => {
    expect(fleschReadingEase(0, 0, 0)).toBe(0)
    expect(fleschKincaidGrade(0, 0, 0)).toBe(0)
  })

  it('scores simple short-sentence text as easy', () => {
    // 10 words, 5 sentences (2 words each), 10 syllables (all monosyllabic).
    const score = fleschReadingEase(10, 5, 10)
    expect(score).toBeGreaterThan(80)
  })

  it('scores long, polysyllabic sentences as harder', () => {
    const easy = fleschReadingEase(10, 5, 10)
    const hard = fleschReadingEase(30, 1, 60)
    expect(hard).toBeLessThan(easy)
  })
})

describe('readingEaseBand', () => {
  it('labels a high score as easy', () => {
    expect(readingEaseBand(95)).toContain('very easy')
  })

  it('labels a mid score as standard', () => {
    expect(readingEaseBand(65)).toContain('standard')
  })

  it('labels a low score as very difficult', () => {
    expect(readingEaseBand(10)).toContain('very difficult')
  })
})

describe('reading and speaking time', () => {
  it('divides word count by the cited words-per-minute figures', () => {
    expect(readingTimeMinutes(238)).toBe(1)
    expect(speakingTimeMinutes(150)).toBe(1)
  })
})

describe('wordFrequency', () => {
  it('counts and ranks words, excluding stopwords by default', () => {
    const freq = wordFrequency('the cat sat on the mat the cat ran', false)
    // "the" (x3) and "on" (x1) are stopwords, leaving cat/sat/mat/cat/ran = 5
    // counted words, so cat (2 of 5) is 40%.
    expect(freq[0]).toEqual({ word: 'cat', count: 2, percent: 40 })
    expect(freq.find((f) => f.word === 'the')).toBeUndefined()
  })

  it('includes stopwords when asked', () => {
    const freq = wordFrequency('the cat sat', true)
    expect(freq.find((f) => f.word === 'the')).toBeDefined()
  })

  it('returns an empty list for empty input', () => {
    expect(wordFrequency('', false)).toEqual([])
  })
})

describe('characterFrequency', () => {
  it('counts each distinct character', () => {
    const freq = characterFrequency('aab')
    expect(freq[0]).toEqual({ char: 'a', count: 2 })
    expect(freq[1]).toEqual({ char: 'b', count: 1 })
  })
})

describe('characterClassCounts', () => {
  it('classifies letters, digits, whitespace, and punctuation', () => {
    expect(characterClassCounts('ab1 2!')).toEqual({
      letters: 2,
      digits: 2,
      punctuation: 1,
      whitespace: 1,
      other: 0,
    })
  })
})

describe('longestWords', () => {
  it('returns the longest unique words, longest first', () => {
    expect(longestWords('a bb ccc bb ccc')).toEqual(['ccc', 'bb', 'a'])
  })

  it('is empty for empty input', () => {
    expect(longestWords('')).toEqual([])
  })
})
