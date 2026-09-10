/**
 * Pattern explanation and ReDoS risk detection.
 *
 * Both walk the pattern text as a small hand-rolled scanner rather than one
 * giant regex. A single "does this look like a token" regex is tempting, but
 * the constructs that matter here, character classes, named groups,
 * lookarounds, escapes, nest and overlap in ways that make a single
 * alternation regex either wrong on edge cases or unreadable. A loop with a
 * handful of `startsWith` checks is both easier to get right and easier to
 * extend with one more construct later.
 */

export interface PatternToken {
  token: string
  meaning: string
}

const ESCAPE_MEANINGS: Record<string, string> = {
  d: 'Digit (0-9)',
  D: 'Not a digit',
  w: 'Word character (letter, digit, or underscore)',
  W: 'Not a word character',
  s: 'Whitespace character',
  S: 'Not a whitespace character',
  b: 'Word boundary',
  B: 'Not a word boundary',
  n: 'Newline',
  r: 'Carriage return',
  t: 'Tab',
  f: 'Form feed',
  v: 'Vertical tab',
  '0': 'Null character',
}

/** Finds the index just past the closing `]` of a class starting at `start`. */
function findClassEnd(pattern: string, start: number): number {
  let i = start + 1
  if (pattern.charAt(i) === '^') i++
  if (pattern.charAt(i) === ']') i++ // a ']' right after '[' or '[^' is a literal, not the closer
  while (i < pattern.length) {
    const ch = pattern.charAt(i)
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === ']') return i + 1
    i++
  }
  return pattern.length // unterminated, treat the rest of the string as the class
}

function describeClass(raw: string): string {
  const negated = raw.startsWith('[^')
  const inner = raw.slice(negated ? 2 : 1, raw.length - 1)
  const parts: string[] = []
  let i = 0
  while (i < inner.length) {
    const ch = inner.charAt(i)
    if (ch === '\\') {
      const next = inner.charAt(i + 1)
      parts.push(ESCAPE_MEANINGS[next] ? `\\${next} (${ESCAPE_MEANINGS[next]})` : `\\${next}`)
      i += 2
      continue
    }
    if (inner.charAt(i + 1) === '-' && inner.charAt(i + 2) !== '') {
      parts.push(`${ch}–${inner.charAt(i + 2)}`)
      i += 3
      continue
    }
    parts.push(ch)
    i++
  }
  return `${negated ? 'Anything except' : 'Any one of'}: ${parts.join(', ') || '(empty)'}`
}

export function explainPattern(pattern: string): PatternToken[] {
  const tokens: PatternToken[] = []
  let literal = ''
  let groupNumber = 0

  const flushLiteral = () => {
    if (literal === '') return
    tokens.push({
      token: literal,
      meaning:
        literal.length === 1 ? `Literal character "${literal}"` : `Literal text "${literal}"`,
    })
    literal = ''
  }

  let i = 0
  while (i < pattern.length) {
    const ch = pattern.charAt(i)

    if (ch === '[') {
      flushLiteral()
      const end = findClassEnd(pattern, i)
      const raw = pattern.slice(i, end)
      tokens.push({ token: raw, meaning: describeClass(raw) })
      i = end
      continue
    }

    if (ch === '(') {
      flushLiteral()
      if (pattern.startsWith('(?:', i)) {
        tokens.push({
          token: '(?:',
          meaning: 'Non-capturing group, groups without creating a numbered capture',
        })
        i += 3
        continue
      }
      if (pattern.startsWith('(?=', i)) {
        tokens.push({
          token: '(?=',
          meaning: 'Positive lookahead, must be followed by this, but it is not part of the match',
        })
        i += 3
        continue
      }
      if (pattern.startsWith('(?!', i)) {
        tokens.push({ token: '(?!', meaning: 'Negative lookahead, must NOT be followed by this' })
        i += 3
        continue
      }
      if (pattern.startsWith('(?<=', i)) {
        tokens.push({
          token: '(?<=',
          meaning: 'Positive lookbehind: must be preceded by this, but it is not part of the match',
        })
        i += 4
        continue
      }
      if (pattern.startsWith('(?<!', i)) {
        tokens.push({
          token: '(?<!',
          meaning: 'Negative lookbehind, must NOT be preceded by this',
        })
        i += 4
        continue
      }
      const named = /^\(\?<([A-Za-z_$][A-Za-z0-9_$]*)>/.exec(pattern.slice(i))
      if (named) {
        groupNumber++
        tokens.push({
          token: named[0],
          meaning: `Named capturing group ${groupNumber}, "${named[1]!}"`,
        })
        i += named[0].length
        continue
      }
      groupNumber++
      tokens.push({
        token: '(',
        meaning: `Capturing group ${groupNumber}, remembers what it matches`,
      })
      i++
      continue
    }
    if (ch === ')') {
      flushLiteral()
      tokens.push({ token: ')', meaning: 'End of group' })
      i++
      continue
    }

    if (ch === '|') {
      flushLiteral()
      tokens.push({ token: '|', meaning: 'Alternation, matches whatever is on either side' })
      i++
      continue
    }
    if (ch === '^') {
      flushLiteral()
      tokens.push({ token: '^', meaning: 'Start of the string (or line, with the m flag)' })
      i++
      continue
    }
    if (ch === '$') {
      flushLiteral()
      tokens.push({ token: '$', meaning: 'End of the string (or line, with the m flag)' })
      i++
      continue
    }
    if (ch === '.') {
      flushLiteral()
      tokens.push({
        token: '.',
        meaning: 'Any character except line terminators (any character at all with the s flag)',
      })
      i++
      continue
    }

    if (ch === '\\') {
      flushLiteral()
      const next = pattern.charAt(i + 1)

      if (/^[1-9]$/.test(next)) {
        const numMatch = /^[1-9][0-9]*/.exec(pattern.slice(i + 1))
        const num = numMatch ? numMatch[0] : next
        tokens.push({ token: `\\${num}`, meaning: `Backreference to capturing group ${num}` })
        i += 1 + num.length
        continue
      }
      if (next === 'k' && pattern.charAt(i + 2) === '<') {
        const named = /^\\k<([A-Za-z_$][A-Za-z0-9_$]*)>/.exec(pattern.slice(i))
        if (named) {
          tokens.push({ token: named[0], meaning: `Backreference to named group "${named[1]!}"` })
          i += named[0].length
          continue
        }
      }
      if (next === 'x') {
        const hex = /^\\x[0-9A-Fa-f]{2}/.exec(pattern.slice(i))
        if (hex) {
          tokens.push({ token: hex[0], meaning: `Character with hex code ${hex[0].slice(2)}` })
          i += hex[0].length
          continue
        }
      }
      if (next === 'u') {
        const unicode = /^\\u\{[0-9A-Fa-f]+\}|^\\u[0-9A-Fa-f]{4}/.exec(pattern.slice(i))
        if (unicode) {
          tokens.push({ token: unicode[0], meaning: `Unicode character ${unicode[0]}` })
          i += unicode[0].length
          continue
        }
      }
      const known = ESCAPE_MEANINGS[next]
      if (known) {
        tokens.push({ token: `\\${next}`, meaning: known })
        i += 2
        continue
      }
      tokens.push({
        token: `\\${next}`,
        meaning: `Escaped literal "${next}", matches the character itself, not as a special one`,
      })
      i += 2
      continue
    }

    if (ch === '*' || ch === '+' || ch === '?') {
      flushLiteral()
      const lazy = pattern.charAt(i + 1) === '?'
      const base = ch === '*' ? '0 or more' : ch === '+' ? '1 or more' : '0 or 1 (optional)'
      tokens.push({
        token: lazy ? `${ch}?` : ch,
        meaning: `${base} of the preceding token${lazy ? ', as few times as possible (lazy)' : ''}`,
      })
      i += lazy ? 2 : 1
      continue
    }

    if (ch === '{') {
      const braces = /^\{(\d+)(,(\d*))?\}\??/.exec(pattern.slice(i))
      if (braces) {
        flushLiteral()
        const lazy = braces[0].endsWith('?')
        const min = braces[1]!
        const hasComma = braces[2] !== undefined
        const max = braces[3]
        const base = !hasComma
          ? `Exactly ${min}`
          : max === '' || max === undefined
            ? `${min} or more`
            : `Between ${min} and ${max}`
        tokens.push({
          token: braces[0],
          meaning: `${base} of the preceding token${lazy ? ', as few times as possible (lazy)' : ''}`,
        })
        i += braces[0].length
        continue
      }
    }

    literal += ch
    i++
  }
  flushLiteral()
  return tokens
}

/* ------------------------------------------------------------ ReDoS risk */

export interface RiskWarning {
  index: number
  message: string
}

interface GroupSpan {
  start: number
  end: number
  inner: string
}

/** Balanced-paren group scan, skipping character classes and escapes. */
function findGroups(pattern: string): GroupSpan[] {
  const groups: GroupSpan[] = []
  const stack: number[] = []
  let i = 0
  while (i < pattern.length) {
    const ch = pattern.charAt(i)
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '[') {
      i = findClassEnd(pattern, i)
      continue
    }
    if (ch === '(') {
      stack.push(i)
      i++
      continue
    }
    if (ch === ')') {
      const start = stack.pop()
      if (start !== undefined) groups.push({ start, end: i, inner: pattern.slice(start + 1, i) })
      i++
      continue
    }
    i++
  }
  return groups
}

const HAS_QUANTIFIER = /[*+]|\{\d+,?\d*\}/

/**
 * Flags the classic exponential-backtracking shapes: a group that contains
 * its own quantified sub-pattern, itself repeated by an unbounded quantifier
 *, `(a+)+`, `(a*)*`, `(\w+)*`, and their `{2,}` spellings. This is a
 * heuristic, not a full static analysis of the pattern's automaton: it will
 * miss more exotic ReDoS shapes (alternation-based ones in particular) and
 * can flag a group that is provably safe once you know its content can never
 * actually overlap. It catches the shape that shows up in the wild by far
 * the most often, which is the one worth a fast, explainable check.
 */
export function detectRisk(pattern: string): RiskWarning[] {
  const warnings: RiskWarning[] = []
  for (const group of findGroups(pattern)) {
    const after = pattern.slice(group.end + 1)
    const quantifier = /^(\*|\+|\{\d+,\d*\})/.exec(after)
    if (!quantifier) continue

    const q = quantifier[0]
    const allowsMany = q === '*' || q === '+' || /^\{\d+,\}?$/.test(q)
    if (!allowsMany) continue

    if (HAS_QUANTIFIER.test(group.inner)) {
      const shape = pattern.slice(group.start, group.end + 1) + q
      warnings.push({
        index: group.start,
        message: `Nested quantifier at position ${group.start}: "${shape}" can match the same text in exponentially many ways. On a long non-matching input this can hang the engine (catastrophic backtracking). Try anchoring the group or narrowing the inner quantifier so it cannot overlap with the outer one.`,
      })
    }
  }
  return warnings
}

/* -------------------------------------------------------------- samples */

export interface SamplePattern {
  name: string
  pattern: string
  flags: string
  sample: string
}

export const SAMPLE_PATTERNS: SamplePattern[] = [
  {
    name: 'Email',
    pattern: '[\\w.+-]+@[\\w-]+\\.[A-Za-z]{2,}',
    flags: 'g',
    sample: 'contact us at hello@example.com or sales@example.co.uk',
  },
  {
    name: 'URL',
    pattern: 'https?:\\/\\/[\\w.-]+(?:\\/[\\w./?%&=-]*)?',
    flags: 'g',
    sample: 'see https://example.com/docs?ref=readme and http://sub.example.org',
  },
  {
    name: 'ISO date',
    pattern: '\\d{4}-\\d{2}-\\d{2}',
    flags: 'g',
    sample: 'shipped on 2026-01-15, delivered 2026-01-20',
  },
  {
    name: 'IPv4',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    flags: 'g',
    sample: 'server at 192.168.1.1, gateway 10.0.0.1',
  },
  {
    name: 'Semver',
    pattern: '\\d+\\.\\d+\\.\\d+(?:-[\\w.]+)?',
    flags: 'g',
    sample: 'upgraded from 2.1.0 to 2.2.0-beta.1',
  },
]
