/**
 * Path parsing, querying, and searching over an already-parsed JSON value.
 *
 * Parsing lives in `json-formatter/json.ts` and is reused from there — this
 * file only ever sees a value that already came out of `JSON.parse`
 * successfully. Its own interesting problem is the path language: a small,
 * forgiving grammar (`data.items[0].name`, `items[*].id`, `*.email`) that has
 * to turn into either a single lookup or, once a `*` is involved, a fan-out
 * across every matching branch.
 */

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function isContainer(value: JsonValue): value is JsonValue[] | { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object'
}

/** Uniform view over an object's or array's children, in iteration order. */
export function childEntries(value: JsonValue): Array<{ key: string; value: JsonValue }> {
  if (Array.isArray(value)) return value.map((item, index) => ({ key: String(index), value: item }))
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).map(([key, entryValue]) => ({ key, value: entryValue }))
  }
  return []
}

/* -------------------------------------------------------------- parsing */

type PathSegment = { type: 'key'; key: string } | { type: 'index'; index: number } | { type: 'wildcard' }

interface ParsedPath {
  segments: PathSegment[]
}

interface ParseError {
  error: string
}

export function parsePath(rawPath: string): ParsedPath | ParseError {
  let path = rawPath.trim()
  if (path === '') return { error: 'Empty path.' }

  // Accept a leading "$" or "$." the way JSONPath does, purely as a courtesy
  // — everything after it is parsed the same way as a bare path.
  if (path.startsWith('$')) path = path.slice(1)
  if (path.startsWith('.')) path = path.slice(1)
  if (path === '') return { segments: [] }

  const segments: PathSegment[] = []
  const n = path.length
  let i = 0

  while (i < n) {
    const ch = path.charAt(i)

    if (ch === '[') {
      const close = path.indexOf(']', i)
      if (close === -1) return { error: `"[" opened at position ${i} is never closed.` }
      const inner = path.slice(i + 1, close)
      if (inner === '*') {
        segments.push({ type: 'wildcard' })
      } else if (/^\d+$/.test(inner)) {
        segments.push({ type: 'index', index: Number(inner) })
      } else {
        return { error: `"[${inner}]" is not valid — use a number or "*" inside brackets.` }
      }
      i = close + 1
      if (path.charAt(i) === '.') i++
      continue
    }

    let j = i
    while (j < n && path.charAt(j) !== '.' && path.charAt(j) !== '[') j++
    const key = path.slice(i, j)
    if (key === '') return { error: `Unexpected "${path.charAt(i)}" at position ${i}.` }
    segments.push(key === '*' ? { type: 'wildcard' } : { type: 'key', key })
    i = j
    if (path.charAt(i) === '.') i++
  }

  return { segments }
}

/* --------------------------------------------------------------- query */

export interface QueryMatch {
  path: string
  value: JsonValue
}

export type QueryResult = { ok: true; matches: QueryMatch[] } | { ok: false; error: string }

export function queryPath(value: JsonValue, rawPath: string): QueryResult {
  const parsed = parsePath(rawPath)
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const matches = resolve(value, parsed.segments, '$')
  if (matches.length === 0) return { ok: false, error: `Nothing at "${rawPath}".` }
  return { ok: true, matches }
}

function resolve(value: JsonValue, segments: PathSegment[], pathSoFar: string): QueryMatch[] {
  const segment = segments[0]
  if (segment === undefined) return [{ path: pathSoFar, value }]
  const rest = segments.slice(1)

  if (segment.type === 'wildcard') {
    return childEntries(value).flatMap(({ key, value: child }) =>
      resolve(child, rest, extendPath(pathSoFar, key, Array.isArray(value))),
    )
  }

  if (segment.type === 'index') {
    if (!Array.isArray(value) || segment.index < 0 || segment.index >= value.length) return []
    const item = value[segment.index]
    if (item === undefined) return []
    return resolve(item, rest, `${pathSoFar}[${segment.index}]`)
  }

  // key
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
  const child = value[segment.key]
  if (child === undefined) return []
  return resolve(child, rest, extendPath(pathSoFar, segment.key, false))
}

function extendPath(base: string, key: string, isIndex: boolean): string {
  return isIndex ? `${base}[${key}]` : `${base}.${key}`
}

/** Strips the trailing segment of a "$.a.b[2]"-style path, for "jump to parent". */
export function parentPath(path: string): string | undefined {
  if (path === '$') return undefined
  const bracket = path.lastIndexOf('[')
  const dot = path.lastIndexOf('.')
  const cut = Math.max(bracket, dot)
  if (cut <= 0) return '$'
  return path.slice(0, cut)
}

/* -------------------------------------------------------------- search */

export interface SearchMatch {
  path: string
  value: JsonValue
  matchedOn: 'key' | 'value'
}

export interface SearchOutcome {
  matches: SearchMatch[]
  truncated: boolean
}

/** Caps results so a substring that matches half a huge document stays responsive. */
const MAX_SEARCH_RESULTS = 500

export function searchTree(value: JsonValue, term: string): SearchOutcome {
  const needle = term.trim().toLowerCase()
  if (needle === '') return { matches: [], truncated: false }

  const matches: SearchMatch[] = []
  let truncated = false

  const visit = (node: JsonValue, path: string, keyLabel: string | undefined): void => {
    if (matches.length >= MAX_SEARCH_RESULTS) {
      truncated = true
      return
    }
    if (keyLabel !== undefined && keyLabel.toLowerCase().includes(needle)) {
      matches.push({ path, value: node, matchedOn: 'key' })
    } else if (!isContainer(node) && matchesScalar(node, needle)) {
      matches.push({ path, value: node, matchedOn: 'value' })
    }

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length && matches.length < MAX_SEARCH_RESULTS; i++) {
        const item = node[i]
        if (item !== undefined) visit(item, `${path}[${i}]`, undefined)
      }
    } else if (node !== null && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        if (matches.length >= MAX_SEARCH_RESULTS) {
          truncated = true
          break
        }
        visit(child, extendPath(path, key, false), key)
      }
    }
  }

  visit(value, '$', undefined)
  return { matches, truncated }
}

function matchesScalar(value: JsonPrimitive, needle: string): boolean {
  if (value === null) return 'null'.includes(needle)
  return String(value).toLowerCase().includes(needle)
}
