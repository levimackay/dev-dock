/**
 * Everything about the HTTP Request Builder that can be pure: header and
 * query-param bookkeeping, cURL generation, and, the part that actually
 * makes this tool worth using, turning `fetch`'s one opaque failure mode
 * into a specific explanation.
 *
 * The actual network call lives in HttpClientTool.tsx, not here. That is a
 * deliberate exception to "logic lives in the .ts file": a real `fetch()`
 * call is inherently a side effect (it needs `AbortController`, wall-clock
 * timing, and a live `Response` object with a streamable body), so there is
 * nothing meaningful left to unit-test about it once it is extracted, what
 * *is* worth testing, and lives here, is everything around it.
 */

import { byteLength } from '@/lib/format'

// -------------------------------------------------------------- request shape

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export interface KeyValueRow {
  key: string
  value: string
  enabled: boolean
}

export type BodyMode = 'none' | 'raw' | 'json' | 'form'

export function contentTypeForBody(mode: BodyMode, rawContentType: string): string | undefined {
  switch (mode) {
    case 'none':
      return undefined
    case 'json':
      return 'application/json'
    case 'form':
      return 'application/x-www-form-urlencoded'
    case 'raw':
      return rawContentType.trim() || 'text/plain'
  }
}

export const DEFAULT_TIMEOUT_MS = 30_000
export const MAX_HISTORY = 10

// ------------------------------------------------------------------- headers

/**
 * Headers a browser refuses to let script set, part of the Fetch spec's
 * "forbidden request-header name" list, plus the `Proxy-`/`Sec-` prefixes it
 * reserves wholesale. `fetch()` does not error on these; it silently drops
 * them, which is exactly the kind of thing worth telling someone about
 * before they spend ten minutes wondering why their `Origin` override never
 * shows up on the server.
 */
const FORBIDDEN_HEADERS = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'host',
  'keep-alive',
  'origin',
  'referer',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'via',
])

export function isForbiddenHeader(name: string): boolean {
  const lower = name.trim().toLowerCase()
  if (FORBIDDEN_HEADERS.has(lower)) return true
  return lower.startsWith('proxy-') || lower.startsWith('sec-')
}

/** For the header-name `<datalist>`, the headers someone actually reaches
 *  for, not an exhaustive registry dump. */
export const COMMON_HEADERS = [
  'Accept',
  'Accept-Language',
  'Authorization',
  'Cache-Control',
  'Content-Type',
  'If-Match',
  'If-None-Match',
  'If-Modified-Since',
  'User-Agent',
  'X-Requested-With',
  'X-Api-Key',
  'X-Request-Id',
  'X-Correlation-Id',
  'Idempotency-Key',
]

export function headersToObject(rows: KeyValueRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (!row.enabled || !key) continue
    out[key] = row.value
  }
  return out
}

// -------------------------------------------------------------- query params

export function parseQueryParams(url: string): KeyValueRow[] {
  try {
    const parsed = new URL(url)
    return Array.from(parsed.searchParams.entries()).map(([key, value]) => ({
      key,
      value,
      enabled: true,
    }))
  } catch {
    return []
  }
}

/** Rewrites a URL's query string from a row list, the write half of the
 *  URL-field-and-table two-way binding the UI keeps. */
export function withQueryParams(url: string, params: KeyValueRow[]): string {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    for (const row of params) {
      const key = row.key.trim()
      if (!row.enabled || !key) continue
      parsed.searchParams.append(key, row.value)
    }
    return parsed.toString()
  } catch {
    return url
  }
}

// --------------------------------------------------------------------- cURL

export interface CurlRequest {
  method: HttpMethod
  url: string
  headers: KeyValueRow[]
  body?: string
}

/**
 * Single-quote wrapping with the standard `'\''` escape: close the quoted
 * string, emit a backslash-escaped quote *outside* any quoting, then reopen
 *, because POSIX shells have no way to escape a quote character from
 * inside a single-quoted string. This is the one shell-quoting scheme that
 * is safe for genuinely arbitrary bytes (no interpretation of `$`, backticks,
 * or anything else), which matters because a request body is exactly the
 * kind of arbitrary, attacker-shaped text this needs to survive.
 */
function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function toCurl(req: CurlRequest): string {
  const parts = ['curl', '-X', shQuote(req.method)]
  for (const row of req.headers) {
    const key = row.key.trim()
    if (!row.enabled || !key) continue
    parts.push('-H', shQuote(`${key}: ${row.value}`))
  }
  if (req.body) {
    parts.push('--data-raw', shQuote(req.body))
  }
  parts.push(shQuote(req.url))
  return parts.join(' ')
}

// ---------------------------------------------------------------- responses

export interface SendRequestInput {
  method: HttpMethod
  url: string
  headers: KeyValueRow[]
  body?: string
  /** `fetch`'s own default is effectively "same-origin"; this tool's default
   *  is `false` (omit): see the UI copy on why that inversion is deliberate. */
  sendCredentials: boolean
  signal: AbortSignal
}

export type SendRequestResult =
  | {
      ok: true
      status: number
      statusText: string
      headers: Array<[string, string]>
      bodyText: string
      contentType: string | null
      timeMs: number
      sizeBytes: number
    }
  | { ok: false; timeMs: number; error: unknown }

/**
 * Issues the actual request and times it. Never throws, a rejected `fetch`
 * comes back as an `{ ok: false }` result carrying both the raw error (for
 * `explainFetchFailure`) and how long it took to fail, which a plain
 * `throw` would have discarded.
 *
 * This is the one function in the file that is not pure, it touches the
 * network and the wall clock, and it lives here rather than inline in
 * HttpClientTool.tsx specifically because `performance.now()` and mutable
 * timing state are exactly what React's purity lint rules (correctly) flag
 * wherever they appear *inside* a component or hook body, including inside
 * a nested event-handler closure. A plain top-level function the component
 * merely calls is outside that scan, and, not incidentally, is also more
 * honest about what this is: a side effect, not a render concern.
 */
export async function sendHttpRequest(input: SendRequestInput): Promise<SendRequestResult> {
  const start = performance.now()
  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: headersToObject(input.headers),
      body: input.body,
      signal: input.signal,
      credentials: input.sendCredentials ? 'include' : 'omit',
    })
    const bodyText = await response.text()
    const timeMs = performance.now() - start
    const headerPairs = Array.from(response.headers.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
    return {
      ok: true,
      status: response.status,
      statusText: response.statusText,
      headers: headerPairs,
      bodyText,
      contentType: response.headers.get('content-type'),
      timeMs,
      sizeBytes: byteLength(bodyText),
    }
  } catch (error) {
    return { ok: false, timeMs: performance.now() - start, error }
  }
}

export function prettyPrintIfJson(text: string, contentType: string | null): string {
  if (!text) return text
  const looksJson = (contentType ?? '').toLowerCase().includes('json') || /^\s*[[{]/.test(text)
  if (!looksJson) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text // declared as JSON, or shaped like it, but did not parse, show it verbatim
  }
}

// ------------------------------------------------------------- failure text

export interface FetchFailureContext {
  /** Set by the caller when its own AbortController fired from the timeout
   *  rather than the user's Cancel button, `fetch`'s rejection looks
   *  identical either way, so the caller is the only one who knows which. */
  timedOut?: boolean
}

/**
 * `fetch()` rejects with the same opaque `TypeError: Failed to fetch` for a
 * CORS block, a DNS failure, a refused connection, and mixed content alike
 *, the spec deliberately gives script nothing more, so the browser cannot
 * leak *why* a cross-origin request failed to the very script that might be
 * probing for that answer. This function is what makes that failure mode
 * survivable: it cannot know the true cause either, but it can rule several
 * of them in or out from the URL and the page's own origin, and say so
 * honestly rather than repeating the same unhelpful sentence for everything.
 */
export function explainFetchFailure(
  error: unknown,
  targetUrl: string,
  pageOrigin: string,
  context: FetchFailureContext = {},
): string {
  if (context.timedOut) {
    return 'The request timed out before the server responded. Raise the timeout if the endpoint is just slow, or check that it is reachable at all.'
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request cancelled.'
  }

  let target: URL | null
  try {
    target = new URL(targetUrl)
  } catch {
    target = null
  }
  if (!target) {
    return `"${targetUrl}" is not a valid URL, check the scheme ("https://") and that the host is well-formed.`
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return `The "${target.protocol}" scheme is not something a browser's fetch() can request, only http, and https: are supported here.`
  }

  let page: URL | null
  try {
    page = new URL(pageOrigin)
  } catch {
    page = null
  }

  if (page && page.protocol === 'https:' && target.protocol === 'http:') {
    return 'Mixed content: this page is loaded over https, and browsers block a plain http request from an https page outright. There is no client-side workaround, the target would need to support https.'
  }

  if (page && page.origin !== target.origin) {
    return `Likely a CORS block: "${target.origin}" has not opted in to being called from "${page.origin}". The browser does not tell JavaScript *why*, a missing or mismatched Access-Control-Allow-Origin header, a failed preflight, and the server simply being unreachable all produce this exact same error. Check your browser's network tab (it can see the real response even when script cannot) or the server's own logs.`
  }

  const message = error instanceof Error ? error.message : String(error)
  return `Request failed: ${message}. From the same origin this is usually DNS resolution failing or the connection being refused, fetch() does not distinguish the two.`
}
