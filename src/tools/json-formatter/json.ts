/**
 * JSON pretty-printing, minifying, validating, and, the interesting part,
 * turning a native `JSON.parse` failure into something a human can act on.
 *
 * `JSON.parse` gives you a message and, on modern V8, a byte offset. Older
 * engines give you even less. None of them tell you *why*, a trailing comma
 * and a missing comma produce equally opaque messages. So `describeJsonError`
 * does not trust the engine's wording at all. It runs its own single-pass
 * scanner over the raw text looking for the shapes of the mistakes people
 * actually make (trailing commas, single-quoted strings, unquoted keys, JS
 * comments, `NaN`/`Infinity`/`undefined`, a raw newline inside a string) and
 * reports the first one it finds, by character position, independent of
 * whatever `JSON.parse` said. Only when none of those known shapes are
 * present does it fall back to parsing the engine's own message for a
 * position. That is what makes the error message consistent across engines
 * and actually name the mistake instead of paraphrasing "Unexpected token".
 */

export type IndentOption = '2' | '4' | 'tab'
export type JsonMode = 'pretty' | 'minify' | 'validate'

export interface JsonFormatOptions {
  indent: IndentOption
  sortKeys: boolean
  escapeNonAscii: boolean
}

export interface JsonStats {
  root: 'object' | 'array' | 'other'
  bytesBefore: number
  bytesAfter: number
  maxDepth: number
  objectCount: number
  arrayCount: number
  keyCount: number
}

export interface JsonSuccess {
  ok: true
  output: string
  stats: JsonStats
}

export interface JsonFailure {
  ok: false
  error: string
}

export type JsonResult = JsonSuccess | JsonFailure

const INDENTS: Record<IndentOption, string> = { '2': '  ', '4': '    ', tab: '\t' }

const EMPTY_STATS: JsonStats = {
  root: 'other',
  bytesBefore: 0,
  bytesAfter: 0,
  maxDepth: 0,
  objectCount: 0,
  arrayCount: 0,
  keyCount: 0,
}

export function processJson(input: string, mode: JsonMode, options: JsonFormatOptions): JsonResult {
  if (input.trim() === '') return { ok: true, output: '', stats: EMPTY_STATS }

  let value: unknown
  try {
    value = JSON.parse(input)
  } catch (error) {
    return { ok: false, error: describeJsonError(input, error) }
  }

  const stats = measure(value)

  // Validate only needs `measure`, which cannot overflow, so it answers at any
  // depth. Re-serialising recurses, so past the cap it is refused with a
  // message rather than allowed to throw RangeError into the render path.
  if (mode !== 'validate' && stats.maxDepth > MAX_JSON_DEPTH) {
    return {
      ok: false,
      error: `This document nests ${stats.maxDepth.toLocaleString()} levels deep, past the ${MAX_JSON_DEPTH.toLocaleString()}-level limit for re-serialising it. Switch to Validate to inspect it without rewriting it.`,
    }
  }

  const shaped = options.sortKeys ? sortKeysDeep(value) : value
  const bytesBefore = byteLength(input)

  // Validate is read-only: it reports on the structure without rewriting what
  // was pasted, so there is nothing to show as "after" size.
  if (mode === 'validate') {
    return {
      ok: true,
      output: '',
      stats: { ...stats, bytesBefore, bytesAfter: bytesBefore },
    }
  }

  let output =
    mode === 'minify'
      ? JSON.stringify(shaped)
      : JSON.stringify(shaped, null, INDENTS[options.indent])
  if (options.escapeNonAscii) output = escapeNonAsciiText(output)

  return {
    ok: true,
    output,
    stats: { ...stats, bytesBefore, bytesAfter: byteLength(output) },
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * How deep a document may be before this module refuses to walk it.
 *
 * `JSON.parse` will happily build a 200,000-level structure. Everything that
 * walks the result afterwards recurses, though, `JSON.stringify` included,
 * which was a surprise and is worth knowing: V8 implements it recursively, so
 * `"[".repeat(10000) + "1" + "]".repeat(10000)`, twenty kilobytes of perfectly
 * valid JSON, throws RangeError on serialisation. The tool crashes on paste.
 *
 * Worse, both JSON tools hydrate from a share link before their first render,
 * so a link alone would do it with no interaction at all, which is exactly the
 * "whoever sends the user a link" case in the threat model.
 *
 * Real documents are shallow: a deeply nested API response is twenty levels.
 * A thousand is far past any honest use and comfortably inside the stack.
 *
 * `measure` is the exception: it is rewritten with an explicit stack, so the
 * depth can always be *reported* even when it cannot be processed.
 */
export const MAX_JSON_DEPTH = 1000

/** Recursively sorts object keys. Array order is left alone: order is data there. */
export function sortKeysDeep(value: unknown, depth = 0): unknown {
  if (depth >= MAX_JSON_DEPTH) return value
  if (Array.isArray(value)) return value.map((item) => sortKeysDeep(item, depth + 1))
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    const out: Record<string, unknown> = {}
    for (const [key, entryValue] of entries) out[key] = sortKeysDeep(entryValue, depth + 1)
    return out
  }
  return value
}

/**
 * Escapes every UTF-16 code unit above ASCII to `\uXXXX`. A surrogate pair
 * (an emoji, most CJK-adjacent astral characters) becomes two escapes, which
 * is standard practice and exactly what `JSON.stringify` would produce if you
 * asked it to: it just never offers to.
 */
export function escapeNonAsciiText(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    out += code > 127 ? `\\u${code.toString(16).padStart(4, '0')}` : text.charAt(i)
  }
  return out
}

/**
 * Counts containers, keys, and depth.
 *
 * Written with an explicit stack rather than recursion. The measurement runs on
 * every keystroke over whatever was pasted, so it is the one walk that must not
 * be able to fail: an explicit stack has no frame limit to exceed, and costs
 * about four extra lines.
 */
function measure(value: unknown): Omit<JsonStats, 'bytesBefore' | 'bytesAfter'> {
  let objectCount = 0
  let arrayCount = 0
  let keyCount = 0
  let maxDepth = 0

  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }]

  while (stack.length > 0) {
    const { node, depth } = stack.pop()!
    if (Array.isArray(node)) {
      if (depth > maxDepth) maxDepth = depth
      arrayCount++
      for (const item of node) stack.push({ node: item, depth: depth + 1 })
    } else if (node !== null && typeof node === 'object') {
      if (depth > maxDepth) maxDepth = depth
      objectCount++
      const entries = Object.entries(node as Record<string, unknown>)
      keyCount += entries.length
      for (const [, entryValue] of entries) stack.push({ node: entryValue, depth: depth + 1 })
    }
  }

  const root = Array.isArray(value)
    ? 'array'
    : value !== null && typeof value === 'object'
      ? 'object'
      : 'other'
  return { root, maxDepth, objectCount, arrayCount, keyCount }
}

/* ------------------------------------------------------------ error path */

interface ScanIssue {
  offset: number
  headline: (input: string, offset: number) => string
}

/**
 * One forward pass over the raw text, classifying each character as it goes
 * (inside a real string, inside a comment, inside a fake single-quoted
 * string, or bare code) so the checks below never fire on a `,` or a `//`
 * that only *looks* wrong because it is sitting inside legitimate string
 * content.
 */
function scanForKnownIssues(input: string): ScanIssue[] {
  const issues: ScanIssue[] = []
  const n = input.length
  let i = 0

  const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

  while (i < n) {
    const ch = input.charAt(i)

    if (ch === '"') {
      i++
      while (i < n && input.charAt(i) !== '"') {
        const c = input.charAt(i)
        if (c === '\\') {
          i += 2
          continue
        }
        if (c.charCodeAt(0) < 0x20) {
          const offset = i
          issues.push({
            offset,
            headline: () =>
              'Unescaped control character inside a string, most often a raw newline. Use \\n (and \\t, \\r, …) instead of an actual line break or tab in a quoted string.',
          })
        }
        i++
      }
      i++
      continue
    }

    if (ch === "'") {
      const offset = i
      issues.push({
        offset,
        headline: () =>
          'Single quotes are not valid JSON, object keys and string values need double quotes (").',
      })
      // Skip the rest of this pseudo-string so its contents cannot trigger
      // a second, misleading issue below.
      i++
      while (i < n && input.charAt(i) !== "'") i++
      i++
      continue
    }

    if (ch === '/' && input.charAt(i + 1) === '/') {
      const offset = i
      issues.push({ offset, headline: () => 'JSON has no comments, remove this // line comment.' })
      while (i < n && input.charAt(i) !== '\n') i++
      continue
    }

    if (ch === '/' && input.charAt(i + 1) === '*') {
      const offset = i
      issues.push({
        offset,
        headline: () => 'JSON has no comments, remove this /* */ block comment.',
      })
      const close = input.indexOf('*/', i + 2)
      i = close === -1 ? n : close + 2
      continue
    }

    if (ch === ',') {
      let j = i + 1
      while (j < n && isSpace(input.charAt(j))) j++
      const next = input.charAt(j)
      if (next === '}' || next === ']') {
        const offset = i
        issues.push({
          offset,
          headline: () =>
            `Trailing comma before the closing "${next}", remove it, JSON has no trailing commas.`,
        })
      }
      i++
      continue
    }

    if (/[A-Za-z_$]/.test(ch)) {
      const start = i
      let j = i + 1
      while (j < n && /[A-Za-z0-9_$]/.test(input.charAt(j))) j++
      const word = input.slice(start, j)

      if (word !== 'true' && word !== 'false' && word !== 'null') {
        let k = j
        while (k < n && isSpace(input.charAt(k))) k++
        if (input.charAt(k) === ':') {
          issues.push({
            offset: start,
            headline: () => `Unquoted key "${word}", object keys must be wrapped in double quotes.`,
          })
        } else if (word === 'NaN' || word === 'Infinity' || word === 'undefined') {
          issues.push({
            offset: start,
            headline: () =>
              `"${word}" is not a valid JSON value, JSON has no NaN, Infinity, or undefined. Use null, or a quoted string.`,
          })
        }
      }
      i = j
      continue
    }

    if (ch === '-' && input.slice(i, i + 9) === '-Infinity') {
      const offset = i
      issues.push({
        offset,
        headline: () =>
          '"-Infinity" is not a valid JSON value, JSON has no Infinity. Use null, or a quoted string.',
      })
      i += 9
      continue
    }

    i++
  }

  return issues
}

/** Converts a character offset into 1-based line/column plus a caret excerpt. */
function locate(input: string, offset: number): { line: number; column: number; excerpt: string } {
  const clamped = Math.max(0, Math.min(offset, input.length))
  let line = 1
  let lineStart = 0
  for (let i = 0; i < clamped; i++) {
    if (input.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  const column = clamped - lineStart + 1

  const nextNewline = input.indexOf('\n', lineStart)
  const fullLine = input.slice(lineStart, nextNewline === -1 ? input.length : nextNewline)

  // Window a long single line rather than dumping the whole thing.
  const WINDOW = 60
  const localCol = clamped - lineStart
  const start = Math.max(0, localCol - WINDOW)
  const end = Math.min(fullLine.length, localCol + WINDOW)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < fullLine.length ? '…' : ''
  const windowed = `${prefix}${fullLine.slice(start, end)}${suffix}`
  const caretPos = prefix.length + (localCol - start)
  const excerpt = `${windowed}\n${' '.repeat(Math.max(0, caretPos))}^`

  return { line, column, excerpt }
}

function withLocation(headline: string, input: string, offset: number): string {
  const { line, column, excerpt } = locate(input, offset)
  return `${headline} (line ${line}, column ${column})\n\n${excerpt}`
}

/** Finds the earliest unmatched `{`/`[`/`"`, the shape of a truncated document. */
function findTruncation(input: string): { offset: number; message: string } | undefined {
  const stack: Array<{ ch: string; offset: number }> = []
  let inString = false
  let stringStart = 0
  const n = input.length

  for (let i = 0; i < n; i++) {
    const ch = input.charAt(i)
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      stringStart = i
    } else if (ch === '{' || ch === '[') {
      stack.push({ ch, offset: i })
    } else if (ch === '}' || ch === ']') {
      stack.pop()
    }
  }

  if (inString) {
    return {
      offset: stringStart,
      message: 'Truncated input, this string is opened here but never closed.',
    }
  }
  const last = stack.at(-1)
  if (last) {
    return {
      offset: last.offset,
      message: `Truncated input, the "${last.ch}" opened here is never closed.`,
    }
  }
  return undefined
}

/**
 * Wraps the engine's own message for the handful of well-defined cases the
 * scanner above cannot see (a missing comma is only detectable by actually
 * parsing), and falls back to the raw message, positioned, for everything
 * else.
 */
function describeFromEngineMessage(input: string, message: string): string {
  // A document with an unclosed brace/bracket/string is truncated, full stop
  //, that is a more useful diagnosis than whatever token the parser choked
  // on next (often "missing comma", which is technically true but not the
  // actual problem), so it takes priority over the position-based cases below.
  const truncation = findTruncation(input)
  if (truncation) return withLocation(truncation.message, input, truncation.offset)

  const positionMatch = /position (\d+)/.exec(message)
  const offset = positionMatch?.[1] !== undefined ? Number(positionMatch[1]) : undefined

  if (offset !== undefined) {
    if (/after property value/.test(message)) {
      return withLocation(
        'Missing comma, a new property starts here without a "," after the previous one.',
        input,
        offset,
      )
    }
    if (/after array element/.test(message)) {
      return withLocation(
        'Missing comma, a new array element starts here without a "," after the previous one.',
        input,
        offset,
      )
    }
    if (/Unterminated string/.test(message)) {
      return withLocation(
        'Truncated input, this string is opened here but never closed.',
        input,
        offset,
      )
    }
    return withLocation(cleanEngineMessage(message), input, offset)
  }

  // No position at all, most commonly "Unexpected end of JSON input", which
  // the truncation check above already handles. Anything left here has
  // neither a known shape nor a position to point at.
  return `${cleanEngineMessage(message)}: could not pin down where; check the input is valid JSON.`
}

/** Strips the "in JSON" filler and any trailing position clause the engine adds. */
function cleanEngineMessage(message: string): string {
  return message
    .replace(/\s*in JSON at position \d+.*$/s, '')
    .replace(/\s*\(line \d+ column \d+\)\s*$/, '')
}

export function describeJsonError(input: string, error: unknown): string {
  const known = scanForKnownIssues(input)
  if (known.length > 0) {
    // Earliest problem in the text is the most likely root cause: every
    // pattern here is invalid JSON wherever it appears, so the first one is
    // as good a place to send someone as any, and usually is the actual one.
    known.sort((a, b) => a.offset - b.offset)
    const first = known[0]
    if (first) return withLocation(first.headline(input, first.offset), input, first.offset)
  }

  const message = error instanceof Error ? error.message : String(error)
  return describeFromEngineMessage(input, message)
}
