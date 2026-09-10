/**
 * A small subsequence fuzzy matcher, used by the command palette and search.
 *
 * The requirement is narrow: rank ~22 short strings against a query of a few
 * characters, so a full trigram index or a dependency like Fuse.js would be
 * more machinery than the problem deserves. What matters instead is that the
 * *ordering* feels right, and ordering comes from the bonus structure, not
 * from the matching algorithm:
 *
 *   - a match at the start of the string beats one in the middle
 *   - a match at a word boundary ("jf" -> **J**SON **F**ormatter) beats one
 *     mid-word
 *   - consecutive characters beat scattered ones
 *   - a shorter haystack beats a longer one at equal quality
 *
 * The scan is greedy left-to-right, which can miss the globally optimal
 * alignment for pathological inputs (querying "aa" against "a-ba"). For tool
 * names that never shows up, and greedy is O(n) instead of O(n·m).
 *
 * Returns `null` for no match so callers can filter with a truthiness check,
 * and returns the matched indices so the UI can highlight them.
 */

export interface FuzzyResult {
  score: number
  /** Indices in the original haystack that the query matched. */
  indices: number[]
}

const SCORE_START = 90
const SCORE_BOUNDARY = 60
const SCORE_CONSECUTIVE = 45
const SCORE_MATCH = 12
const PENALTY_GAP = -3
const PENALTY_LENGTH = -0.35

const isBoundary = (text: string, index: number): boolean => {
  if (index === 0) return true
  const prev = text[index - 1]!
  const curr = text[index]!
  if (/[\s\-_/.:]/.test(prev)) return true
  // camelCase boundary: lower-then-upper in the *original* casing.
  //
  // The final clause is not redundant, though it looks it. Digits and
  // punctuation are equal to their own lowercase, so without it "2F" in
  // "user2FA" and "-C" in "a-Cat" both register as camelCase humps, and a query
  // scores against boundaries that a reader would never call boundaries.
  return prev === prev.toLowerCase() && curr !== curr.toLowerCase() && /[a-z]/i.test(prev)
}

export function fuzzyMatch(haystack: string, query: string): FuzzyResult | null {
  if (!query) return { score: 1, indices: [] }
  if (!haystack) return null

  const lowerHay = haystack.toLowerCase()
  const lowerQuery = query.toLowerCase()

  // Exact substring is always the best possible answer; short-circuit so
  // "json" ranks JSON Formatter above anything that merely contains j-s-o-n.
  const exact = lowerHay.indexOf(lowerQuery)
  if (exact !== -1) {
    const indices = Array.from({ length: query.length }, (_, i) => exact + i)
    const base =
      exact === 0 ? SCORE_START * 2 : isBoundary(haystack, exact) ? SCORE_BOUNDARY * 2 : 0
    return {
      score:
        base + query.length * (SCORE_MATCH + SCORE_CONSECUTIVE) + haystack.length * PENALTY_LENGTH,
      indices,
    }
  }

  const indices: number[] = []
  let score = 0
  let hayIndex = 0
  let lastMatch = -2

  for (let q = 0; q < lowerQuery.length; q++) {
    const ch = lowerQuery[q]!
    if (ch === ' ') continue // spaces in a query mean "anything between"

    const found = lowerHay.indexOf(ch, hayIndex)
    if (found === -1) return null

    score += SCORE_MATCH
    if (found === 0) score += SCORE_START
    else if (isBoundary(haystack, found)) score += SCORE_BOUNDARY
    if (found === lastMatch + 1) score += SCORE_CONSECUTIVE
    else if (lastMatch >= 0) score += (found - lastMatch - 1) * PENALTY_GAP

    indices.push(found)
    lastMatch = found
    hayIndex = found + 1
  }

  return { score: score + haystack.length * PENALTY_LENGTH, indices }
}

/**
 * Scores a query against several fields with per-field weights, keeping the
 * highlight indices only for the primary (first) field so the UI does not have
 * to reason about which field a highlight belongs to.
 */
export function fuzzyScoreFields(
  fields: Array<{ text: string; weight: number }>,
  query: string,
): FuzzyResult | null {
  let best: FuzzyResult | null = null
  let primary: FuzzyResult | null = null

  for (const [i, field] of fields.entries()) {
    const result = fuzzyMatch(field.text, query)
    if (!result) continue
    const weighted = { score: result.score * field.weight, indices: result.indices }
    if (i === 0) primary = result
    if (!best || weighted.score > best.score) best = weighted
  }

  if (!best) return null
  return { score: best.score, indices: primary?.indices ?? [] }
}
