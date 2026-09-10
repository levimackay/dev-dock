/**
 * Text statistics: counts, reading/speaking time, readability, and frequency
 * tables.
 *
 * Everything here is a heuristic over plain text — there is no NLP library
 * involved, on purpose (the app has no dependency for this and does not need
 * one). Sentence and syllable counting in particular are approximations;
 * both are documented at the point they are least trustworthy rather than
 * pretending to be exact.
 */

const WORD_RE = /[A-Za-z0-9']+/g

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0
}

export function extractWords(text: string): string[] {
  return text.match(WORD_RE) ?? []
}

export function countUniqueWords(text: string): number {
  return new Set(extractWords(text).map((w) => w.toLowerCase())).size
}

/**
 * Sentence counting by punctuation is inherently approximate — "Mr. Smith
 * arrived at 3.5 p.m." reads as more sentences than it is, because a period
 * after an abbreviation looks identical to a period ending a sentence with no
 * dictionary of abbreviations to rule it out. This treats a run of `.!?`
 * followed by whitespace-or-end as one sentence boundary, and requires at
 * least one word character before it so trailing punctuation on its own
 * (or an ellipsis with nothing before it) does not count as an extra
 * sentence.
 */
export function countSentences(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const matches = trimmed.match(/[^.!?]*[A-Za-z0-9][^.!?]*[.!?]+(?=\s|$)/g)
  if (matches) return matches.length
  // No terminal punctuation at all — the whole thing is one sentence
  // fragment, which is still one sentence for averaging purposes.
  return 1
}

export function countParagraphs(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\n\s*\n+/).filter((p) => p.trim() !== '').length
}

export function countLines(text: string): number {
  return text === '' ? 0 : text.split(/\r\n|\r|\n/).length
}

export function countCharacters(text: string): { withSpaces: number; withoutSpaces: number } {
  return { withSpaces: text.length, withoutSpaces: text.replace(/\s/g, '').length }
}

/**
 * Vowel-group syllable heuristic with the two most common English
 * corrections (silent trailing e, and the usually-silent -ed suffix). This
 * is a heuristic, not a dictionary lookup: it is reliably wrong on
 * irregular words (contractions, "queue", "simile", proper nouns borrowed
 * from other languages) at a rate that is generally cited around 10-15% of
 * running text. That is accurate enough for a Flesch score, which is itself
 * an estimate, not a guarantee — but it should not be read as an exact count
 * for any single word.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length === 0) return 0
  if (w.length <= 3) return 1

  let working = w
  // Trailing silent e ("make" -> "mak"), except after a consonant + "le"
  // ("table", "little"), where the e is the vowel of its own syllable.
  if (/[^aeiouy]e$/.test(working) && !/[^aeiouy]le$/.test(working)) {
    working = working.slice(0, -1)
  }
  // "-ed" is silent unless it follows t/d, where it is its own syllable
  // ("walked" -> 1, "wanted" -> 2).
  if (/[^td]ed$/.test(working)) {
    working = working.slice(0, -2)
  }

  const groups = working.match(/[aeiouy]+/g) ?? []
  return Math.max(1, groups.length)
}

export function totalSyllables(text: string): number {
  return extractWords(text).reduce((sum, w) => sum + countSyllables(w), 0)
}

/* ------------------------------------------------------------- readability */

/** Silent reading speed. Source: Brysbaert (2019), a meta-analysis putting adult silent reading at ~238 wpm. */
export const READING_WPM = 238
/** Typical spoken presentation pace, the commonly cited figure for a paced talk. */
export const SPEAKING_WPM = 150

export function readingTimeMinutes(words: number): number {
  return words / READING_WPM
}

export function speakingTimeMinutes(words: number): number {
  return words / SPEAKING_WPM
}

export function fleschReadingEase(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0
  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
}

export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words === 0 || sentences === 0) return 0
  return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
}

export function readingEaseBand(score: number): string {
  if (score >= 90) return 'very easy, 5th grade'
  if (score >= 80) return 'easy, 6th grade'
  if (score >= 70) return 'fairly easy, 7th grade'
  if (score >= 60) return 'standard, 8th-9th grade'
  if (score >= 50) return 'fairly difficult, 10th-12th grade'
  if (score >= 30) return 'difficult, college'
  return 'very difficult, college graduate'
}

/* -------------------------------------------------------------- frequency */

export const DEFAULT_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'had',
  'has',
  'have',
  'he',
  'her',
  'his',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'me',
  'my',
  'no',
  'not',
  'of',
  'on',
  'or',
  'our',
  'she',
  'so',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'will',
  'with',
  'you',
  'your',
])

export interface WordFrequency {
  word: string
  count: number
  percent: number
}

export function wordFrequency(
  text: string,
  includeStopwords: boolean,
  limit = 20,
): WordFrequency[] {
  const words = extractWords(text).map((w) => w.toLowerCase())
  const counted = new Map<string, number>()
  for (const w of words) {
    if (!includeStopwords && DEFAULT_STOPWORDS.has(w)) continue
    counted.set(w, (counted.get(w) ?? 0) + 1)
  }
  const total = [...counted.values()].reduce((a, b) => a + b, 0)
  return [...counted.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, percent: total === 0 ? 0 : (count / total) * 100 }))
}

export interface CharFrequency {
  char: string
  count: number
}

export function characterFrequency(text: string, limit = 20): CharFrequency[] {
  const counted = new Map<string, number>()
  for (const ch of text) {
    counted.set(ch, (counted.get(ch) ?? 0) + 1)
  }
  return [...counted.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([char, count]) => ({ char, count }))
}

export interface CharClassCounts {
  letters: number
  digits: number
  punctuation: number
  whitespace: number
  other: number
}

export function characterClassCounts(text: string): CharClassCounts {
  const counts: CharClassCounts = { letters: 0, digits: 0, punctuation: 0, whitespace: 0, other: 0 }
  for (const ch of text) {
    if (/[A-Za-z]/.test(ch)) counts.letters++
    else if (/[0-9]/.test(ch)) counts.digits++
    else if (/\s/.test(ch)) counts.whitespace++
    else if (/[!-/:-@[-`{-~]/.test(ch)) counts.punctuation++
    else counts.other++
  }
  return counts
}

export function longestWords(text: string, limit = 10): string[] {
  const unique = [...new Set(extractWords(text))]
  return unique.sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, limit)
}

export const SAMPLE_TEXT = `The Dev Dock toolkit favors small, well-tested utilities over heavyweight
dependencies. Each tool ships with its own logic file and its own tests, so
the behavior of a text transform is never a mystery. Readers can trust that
what they paste in is handled the same way every time.

This paragraph exists mainly to give the statistics something real to count:
multiple sentences, a couple of paragraphs, and a reasonably varied
vocabulary. Try pasting your own writing here instead — the numbers update
as you type.`
