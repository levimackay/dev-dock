/**
 * Word splitting and case conversion.
 *
 * `splitWords` is the whole tool — every conversion below is just "split,
 * then rejoin with a different case and separator." Getting the split right
 * for camelCase/PascalCase boundaries, acronym runs, and digits is the
 * actual problem.
 *
 * The approach: first split on any run of non-alphanumeric characters (that
 * handles snake_case, kebab-case, dot.case, path/case, and plain spaces —
 * whatever the separator, it disappears and leaves alphanumeric segments).
 * Then each segment is re-split with one token regex that finds camelCase
 * boundaries, acronym runs, and digit runs:
 *
 *     [A-Z]+(?=[A-Z][a-z])   an acronym run, but only up to the LAST
 *                            uppercase letter before a new word starts —
 *                            "XMLHttpRequest" keeps "XML" together and lets
 *                            "Http" start at the letter that is followed by
 *                            lowercase, because that capital is the start of
 *                            the next real word, not part of the acronym.
 *   | [A-Z]?[a-z]+           an optional capital followed by lowercase —
 *                            ordinary words and PascalCase/camelCase parts.
 *   | [A-Z]+                 a trailing acronym with no lowercase after it
 *                            ("ID", or the "FA" in "user2FA").
 *   | [0-9]+                 a run of digits.
 *
 * Digits are always their own token ("user2FA" -> "user", "2", "FA"), not
 * fused onto the run before or after them. The alternative — deciding that a
 * digit "belongs" to the acronym that follows it, or the word that precedes
 * it — is genuinely ambiguous ("2FA" could be one token meaning two-factor
 * auth, or "2" then "FA"); always splitting them out is at least consistent
 * and predictable, which matters more for a tool than guessing right on any
 * one input.
 */

const WORD_RE = /[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|[0-9]+/g

export function splitWords(input: string): string[] {
  const words: string[] = []
  for (const segment of input.split(/[^A-Za-z0-9]+/)) {
    if (segment === '') continue
    const matches = segment.match(WORD_RE)
    if (matches) words.push(...matches)
  }
  return words
}

const toLower = (w: string) => w.toLowerCase()
const toUpper = (w: string) => w.toUpperCase()
const capitalize = (w: string) => (w === '' ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase())

export type CaseId =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'screamingSnake'
  | 'kebab'
  | 'cobol'
  | 'title'
  | 'sentence'
  | 'lower'
  | 'upper'
  | 'dot'
  | 'path'
  | 'train'
  | 'alternating'
  | 'inverse'

export interface CaseDef {
  id: CaseId
  label: string
  /** A short example so the results list is self-explanatory at a glance. */
  example: string
}

export const CASES: CaseDef[] = [
  { id: 'camel', label: 'camelCase', example: 'devDockCaseConverter' },
  { id: 'pascal', label: 'PascalCase', example: 'DevDockCaseConverter' },
  { id: 'snake', label: 'snake_case', example: 'dev_dock_case_converter' },
  { id: 'screamingSnake', label: 'SCREAMING_SNAKE_CASE', example: 'DEV_DOCK_CASE_CONVERTER' },
  { id: 'kebab', label: 'kebab-case', example: 'dev-dock-case-converter' },
  { id: 'cobol', label: 'COBOL-CASE', example: 'DEV-DOCK-CASE-CONVERTER' },
  { id: 'title', label: 'Title Case', example: 'Dev Dock Case Converter' },
  { id: 'sentence', label: 'Sentence case', example: 'Dev dock case converter' },
  { id: 'lower', label: 'lowercase', example: 'dev dock case converter' },
  { id: 'upper', label: 'UPPERCASE', example: 'DEV DOCK CASE CONVERTER' },
  { id: 'dot', label: 'dot.case', example: 'dev.dock.case.converter' },
  { id: 'path', label: 'path/case', example: 'dev/dock/case/converter' },
  { id: 'train', label: 'Train-Case', example: 'Dev-Dock-Case-Converter' },
  { id: 'alternating', label: 'aLtErNaTiNg', example: 'dEv DoCk CaSe CoNvErTeR' },
  { id: 'inverse', label: 'iNVERSE', example: 'dEV dOCK cASE cONVERTER' },
]

/** Word-boundary-based conversions. `alternating`/`inverse` are handled separately below. */
function convertWords(words: string[], id: Exclude<CaseId, 'alternating' | 'inverse'>): string {
  if (words.length === 0) return ''
  switch (id) {
    case 'camel':
      return words.map((w, i) => (i === 0 ? toLower(w) : capitalize(w))).join('')
    case 'pascal':
      return words.map(capitalize).join('')
    case 'snake':
      return words.map(toLower).join('_')
    case 'screamingSnake':
      return words.map(toUpper).join('_')
    case 'kebab':
      return words.map(toLower).join('-')
    case 'cobol':
      return words.map(toUpper).join('-')
    case 'title':
      return words.map(capitalize).join(' ')
    case 'sentence':
      return words.map((w, i) => (i === 0 ? capitalize(w) : toLower(w))).join(' ')
    case 'lower':
      return words.map(toLower).join(' ')
    case 'upper':
      return words.map(toUpper).join(' ')
    case 'dot':
      return words.map(toLower).join('.')
    case 'path':
      return words.map(toLower).join('/')
    case 'train':
      return words.map(capitalize).join('-')
  }
}

/** Alternates letter case by position, ignoring (but passing through) non-letters. */
export function alternatingCase(input: string): string {
  let out = ''
  let letterIndex = 0
  for (const ch of input) {
    if (/[a-zA-Z]/.test(ch)) {
      out += letterIndex % 2 === 0 ? ch.toLowerCase() : ch.toUpperCase()
      letterIndex++
    } else {
      out += ch
    }
  }
  return out
}

/** Swaps the case of every letter, leaving everything else untouched. */
export function inverseCase(input: string): string {
  let out = ''
  for (const ch of input) {
    if (ch >= 'a' && ch <= 'z') out += ch.toUpperCase()
    else if (ch >= 'A' && ch <= 'Z') out += ch.toLowerCase()
    else out += ch
  }
  return out
}

export function convertCase(input: string, id: CaseId): string {
  if (id === 'alternating') return alternatingCase(input)
  if (id === 'inverse') return inverseCase(input)
  return convertWords(splitWords(input), id)
}

/**
 * Applies a conversion line by line so a pasted list of identifiers converts
 * as a list, or to the whole input as one unit when `perLine` is off. For the
 * two character-based conversions (alternating/inverse), `perLine` controls
 * whether the alternation phase resets at each line break or runs
 * continuously through the whole input — both are defensible; resetting per
 * line is what most "spongebob case" generators do, and is what `perLine`
 * chooses here.
 */
export function convertText(input: string, id: CaseId, perLine: boolean): string {
  if (!perLine) return convertCase(input, id)
  return input
    .split(/\r\n|\r|\n/)
    .map((line) => convertCase(line, id))
    .join('\n')
}
