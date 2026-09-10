/**
 * URL decomposition, query-table editing, and the small pile of heuristics
 * that make a URL parser actually useful: tracking-parameter recognition,
 * IP/IDN detection, and double-encoding detection.
 *
 * Everything here is plain data in, plain data out — the platform `URL`
 * parser (WHATWG URL, available as a global outside the DOM too) does the
 * real work; this file explains its failures and adds the editable-table
 * layer on top.
 */

export interface UrlParts {
  href: string
  protocol: string
  username: string
  password: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  hash: string
  origin: string
}

export type ParseResult = { ok: true; parts: UrlParts } | { ok: false; error: string }

/**
 * Parses with the platform `URL` constructor and, on failure, does its own
 * pass over the text to say *why* rather than surfacing the constructor's
 * generic "Invalid URL" `TypeError`. The checks are ordered from the most
 * common mistake (no scheme) to the most specific (a bad port), because the
 * first one that matches is the one worth telling the user about.
 */
export function parseUrl(input: string): ParseResult {
  const text = input.trim()
  if (!text) return { ok: false, error: 'Nothing to parse yet.' }

  try {
    const url = new URL(text)
    return {
      ok: true,
      parts: {
        href: url.href,
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        origin: url.origin,
      },
    }
  } catch {
    return { ok: false, error: explainUrlFailure(text) }
  }
}

function explainUrlFailure(text: string): string {
  const schemeMatch = /^([a-zA-Z][a-zA-Z\d+.-]*):/.exec(text)
  if (!schemeMatch) {
    return `Missing scheme — a URL needs "https://" (or another scheme) before the host. Try "https://${text}".`
  }

  const scheme = schemeMatch[1]!
  const rest = text.slice(scheme.length + 1)

  if (rest.startsWith('//')) {
    const authority = rest.slice(2).split(/[/?#]/)[0] ?? ''
    const hostPart = authority.split('@').pop() ?? ''

    // A trailing ":<garbage>" on the authority is almost always a bad port —
    // this is the one case worth calling out by name rather than folding
    // into the generic fallback below.
    const portMatch = /:([^:]*)$/.exec(hostPart)
    if (portMatch) {
      const portText = portMatch[1]!
      const portValue = Number(portText)
      if (portText !== '' && (!/^\d+$/.test(portText) || portValue > 65535)) {
        return `Invalid port "${portText}" — a port must be a whole number from 0 to 65535.`
      }
    }

    const hostOnly = hostPart.replace(/:\d*$/, '')
    if (!hostOnly) {
      return 'Missing host — nothing between "//" and the next "/", "?", or "#".'
    }
  }

  return `Could not parse this as a URL. Check the "${scheme}:" scheme and that the host after it is well-formed.`
}

// -------------------------------------------------------------------------
// Query parameters
// -------------------------------------------------------------------------

export interface QueryParam {
  /** Decoded, directly editable. */
  key: string
  value: string
  /**
   * The value exactly as it appeared in the source query string, still
   * percent-encoded. Empty for a row added in the UI, which has no "source"
   * form yet — used for the double-encoding check and the raw-form display.
   */
  rawValue: string
  /** Percent-encode `value` when the query string is rebuilt. Default true. */
  encode: boolean
  /** True for a flag-style param (`?debug`) with no `=` at all in the source. */
  flagOnly: boolean
}

/** `+` means space in a query string by long-standing convention (HTML forms),
 *  even though it is outside the URL spec proper — every real server treats it
 *  that way, so a parser that does not would be wrong about real-world URLs. */
function decodeQueryToken(token: string): string {
  const withSpaces = token.replace(/\+/g, ' ')
  try {
    return decodeURIComponent(withSpaces)
  } catch {
    return withSpaces // malformed escape — show it raw rather than throwing
  }
}

/**
 * Splits a query string into rows, one per `&`-separated pair, preserving
 * duplicate keys as separate rows (`?a=1&a=2` is two entries, not a
 * collapsed one) because `URLSearchParams`-style Map semantics would lose
 * that on the very first tool a repeated-key URL is pasted into.
 */
export function parseQueryParams(search: string): QueryParam[] {
  const s = search.startsWith('?') ? search.slice(1) : search
  if (!s) return []
  return s.split('&').map((pair) => {
    const eq = pair.indexOf('=')
    const rawKey = eq === -1 ? pair : pair.slice(0, eq)
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1)
    return {
      key: decodeQueryToken(rawKey),
      value: decodeQueryToken(rawValue),
      rawValue,
      encode: true,
      flagOnly: eq === -1,
    }
  })
}

export function buildQueryString(params: QueryParam[]): string {
  if (params.length === 0) return ''
  const pairs = params.map((p) => {
    const key = encodeURIComponent(p.key)
    if (p.flagOnly && p.value === '') return key
    const value = p.encode ? encodeURIComponent(p.value) : p.value
    return `${key}=${value}`
  })
  return `?${pairs.join('&')}`
}

/**
 * True when a value's percent-encoding was itself percent-encoded — the
 * classic "pasted a URL that was already encoded, then encoded it again"
 * mistake. Detected by decoding once, checking whether what is left still
 * looks like a percent-encoded sequence, and confirming a second decode
 * changes it further. Not foolproof (a value that *legitimately* contains
 * the literal text "%20" will false-positive) but a useful nudge.
 */
export function isDoubleEncoded(rawValue: string): boolean {
  if (!rawValue) return false
  const once = decodeQueryToken(rawValue)
  if (once === rawValue) return false
  if (!/%[0-9a-f]{2}/i.test(once)) return false
  const twice = decodeQueryToken(once)
  return twice !== once
}

// -------------------------------------------------------------------------
// Path and fragment
// -------------------------------------------------------------------------

export function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/** Looks like `a=1&b=2` — a fragment used as a second query string, a common
 *  pattern in client-side routers that predate the History API. */
const FRAGMENT_PARAMS_RE = /^[^&=]+=[^&]*(&[^&=]+=[^&]*)*$/

export function parseFragmentParams(hash: string): QueryParam[] | null {
  const s = hash.startsWith('#') ? hash.slice(1) : hash
  if (!s || !FRAGMENT_PARAMS_RE.test(s)) return null
  return parseQueryParams(s)
}

// -------------------------------------------------------------------------
// Host heuristics
// -------------------------------------------------------------------------

export function isIpAddress(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true
  return h.includes(':') // URL already validated this as a legal hostname
}

/**
 * A naive "public suffix" guess: the last two dot-labels. Real effective-TLD
 * detection needs the Public Suffix List (thousands of entries, e.g. "co.uk"
 * vs "london" vs "github.io") which is not worth bundling for a hint in a
 * dev tool — this is wrong for exactly the multi-label-suffix domains that
 * matter most (it reports "co.uk" for "bbc.co.uk", which is technically the
 * registrable suffix there, but also "co.uk" for "example.co.uk" with no way
 * to tell those apart from string shape alone). Labelled as a heuristic in
 * the UI, not presented as authoritative.
 */
export function naiveSuffix(hostname: string): string | null {
  if (isIpAddress(hostname)) return null
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length < 2) return null
  return labels.slice(-2).join('.')
}

export function isIdnHost(hostname: string): boolean {
  return hostname.split('.').some((label) => label.toLowerCase().startsWith('xn--'))
}

/**
 * Decodes a punycode label (RFC 3492) back to Unicode for display.
 *
 * `URL` converts a typed Unicode host *to* punycode (ToASCII) but the
 * platform gives no scriptable way back — browsers only do ToUnicode in
 * their own address-bar rendering, not through an API. This is the standard
 * bootstring algorithm, about 40 lines, verified against Node's built-in
 * (deprecated, Node-only) `punycode` module against RFC 3492's own sample
 * strings during development; it is not a runtime dependency.
 *
 * Worth having at all because a homograph domain — Cyrillic "а" standing in
 * for Latin "a" — is a real phishing technique, and "xn--" prefixes alone
 * are unreadable enough that nobody actually checks them by eye.
 */
export function decodePunycodeLabel(label: string): string {
  if (!label.toLowerCase().startsWith('xn--')) return label
  try {
    return decodeBootstring(label.slice(4))
  } catch {
    return label // malformed punycode — show the raw label rather than throwing
  }
}

export function decodeIdnHostname(hostname: string): string {
  return hostname.split('.').map(decodePunycodeLabel).join('.')
}

const PUNY_BASE = 36
const PUNY_T_MIN = 1
const PUNY_T_MAX = 26
const PUNY_SKEW = 38
const PUNY_DAMP = 700
const PUNY_INITIAL_BIAS = 72
const PUNY_INITIAL_N = 128

function punyAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let d = firstTime ? Math.floor(delta / PUNY_DAMP) : Math.floor(delta / 2)
  d += Math.floor(d / numPoints)
  let k = 0
  while (d > ((PUNY_BASE - PUNY_T_MIN) * PUNY_T_MAX) >> 1) {
    d = Math.floor(d / (PUNY_BASE - PUNY_T_MIN))
    k += PUNY_BASE
  }
  return k + Math.floor(((PUNY_BASE - PUNY_T_MIN + 1) * d) / (d + PUNY_SKEW))
}

function punyDecodeDigit(codePoint: number): number {
  if (codePoint - 48 < 10) return codePoint - 22 // '0'-'9'
  if (codePoint - 65 < 26) return codePoint - 65 // 'A'-'Z'
  if (codePoint - 97 < 26) return codePoint - 97 // 'a'-'z'
  throw new Error('invalid punycode digit')
}

function decodeBootstring(input: string): string {
  let n = PUNY_INITIAL_N
  let i = 0
  let bias = PUNY_INITIAL_BIAS
  const output: number[] = []

  let basicEnd = input.lastIndexOf('-')
  if (basicEnd < 0) basicEnd = 0
  for (let j = 0; j < basicEnd; j++) {
    const code = input.charCodeAt(j)
    if (code >= 0x80) throw new Error('invalid basic code point')
    output.push(code)
  }

  let index = basicEnd > 0 ? basicEnd + 1 : 0
  const len = input.length
  while (index < len) {
    const oldI = i
    let w = 1
    for (let k = PUNY_BASE; ; k += PUNY_BASE) {
      if (index >= len) throw new Error('unterminated punycode sequence')
      const digit = punyDecodeDigit(input.charCodeAt(index++))
      i += digit * w
      const t = k <= bias ? PUNY_T_MIN : k >= bias + PUNY_T_MAX ? PUNY_T_MAX : k - bias
      if (digit < t) break
      w *= PUNY_BASE - t
    }
    const outLen = output.length + 1
    bias = punyAdapt(i - oldI, outLen, oldI === 0)
    n += Math.floor(i / outLen)
    i %= outLen
    output.splice(i, 0, n)
    i++
  }

  return String.fromCodePoint(...output)
}

// -------------------------------------------------------------------------
// Tracking parameters
// -------------------------------------------------------------------------

const TRACKING_EXPLANATIONS: Record<string, string> = {
  utm_source: 'Marketing source of the visit (e.g. a newsletter or ad network) — Google Analytics campaign tracking.',
  utm_medium: 'Marketing medium (e.g. "cpc", "email", "social") — Google Analytics campaign tracking.',
  utm_campaign: 'Name of the specific marketing campaign — Google Analytics campaign tracking.',
  utm_term: 'Paid-search keyword that triggered the ad — Google Analytics campaign tracking.',
  utm_content: 'Distinguishes similar links within the same ad or campaign — Google Analytics campaign tracking.',
  gclid: 'Google Ads click identifier — attributes this visit back to a specific ad click.',
  fbclid: 'Facebook/Meta click identifier, appended when a link is shared or clicked on their platforms.',
  msclkid: 'Microsoft Advertising click identifier — the Bing Ads equivalent of gclid.',
  mc_eid: "Mailchimp per-recipient identifier — ties this click back to one specific subscriber's email.",
  ref: 'Generic referral/source marker used by many sites; the exact meaning is site-specific.',
}

export function trackingExplanation(key: string): string | undefined {
  const lower = key.toLowerCase()
  if (lower.startsWith('utm_')) return TRACKING_EXPLANATIONS[lower] ?? 'A Google Analytics-style campaign parameter.'
  return TRACKING_EXPLANATIONS[lower]
}

export function isTrackingParam(key: string): boolean {
  return trackingExplanation(key) !== undefined
}

export function stripTrackingParams(params: QueryParam[]): QueryParam[] {
  return params.filter((p) => !isTrackingParam(p.key))
}
