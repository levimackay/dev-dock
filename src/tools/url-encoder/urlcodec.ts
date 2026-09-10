/**
 * URL / percent encoding.
 *
 * The platform gives us three primitives that each encode a *different* set
 * of characters, and picking the wrong one is the single most common URL bug:
 *
 *   - `encodeURIComponent` escapes everything except `A-Za-z0-9 - _ . ! ~ * ' ( )`.
 *     Use it on a value going *into* a URL, a query param, a path segment,
 *     because it also escapes `& = ? #`, which would otherwise be
 *     mis-parsed as structure rather than content.
 *   - `encodeURI` escapes far less: it assumes the input is already a whole
 *     URL and leaves `: / ? # [ ] @ & = + $ , ;` alone, because those are
 *     structural in a URL and escaping them would break it.
 *   - `application/x-www-form-urlencoded` (HTML form submission) is its own
 *     dialect: it encodes almost like `encodeURIComponent` but additionally
 *     turns a space into `+` rather than `%20`, and decodes `+` back to
 *     space. Passing a form-encoded string through `decodeURIComponent`
 *     directly leaves literal `+` characters sitting in the output.
 *
 * There is no single "encode a URL" function on the platform because there
 * is no single correct escaping for every position in a URL, that is the
 * whole reason this tool exists rather than being a two-line wrapper.
 */

export type UrlEncodeMode = 'component' | 'full' | 'form'

export interface DecodeResult {
  ok: boolean
  text: string
  error?: string
  /** How many decode passes actually ran (1 unless "decode repeatedly" is on). */
  passes: number
  /** True only when "decode repeatedly" stopped because it hit the cap, not because it stabilised. */
  hitCap: boolean
}

export const REPEAT_DECODE_CAP = 10

export function encodeUrl(text: string, mode: UrlEncodeMode): string {
  if (mode === 'full') return encodeURI(text)
  if (mode === 'form') return encodeURIComponent(text).replace(/%20/g, '+')
  return encodeURIComponent(text)
}

/**
 * Runs one decode pass and turns a thrown `URIError` into a message that
 * names the bad escape and where it is, rather than the useless default
 * "URI malformed". `decodeURIComponent`/`decodeURI` throw as soon as they hit
 * an incomplete or invalid `%XX` triplet (e.g. `%E0%A4%A`, a truncated
 * 3-byte UTF-8 sequence) and give no indication of *where*, so we re-scan for
 * the first percent escape that is not two valid hex digits, or that starts a
 * UTF-8 sequence the decoder would reject.
 */
function decodeOnce(
  text: string,
  mode: UrlEncodeMode,
): { ok: true; text: string } | { ok: false; error: string } {
  const input = mode === 'form' ? text.replace(/\+/g, ' ') : text

  try {
    return { ok: true, text: mode === 'full' ? decodeURI(input) : decodeURIComponent(input) }
  } catch {
    return { ok: false, error: locateBadEscape(input) }
  }
}

/**
 * Finds the first `%` escape responsible for a thrown `URIError`, and reports
 * its position.
 *
 * The tempting shortcut: decode each `%XX` escape on its own to see which
 * one throws: does not work: a lone lead byte like `%E0` throws by itself
 * (it is not valid UTF-8 without its continuation bytes) even when it is
 * perfectly correct in context. So this only makes the claim it can back up:
 * syntax. Every real-world "malformed URI" we can point at with certainty is
 * a `%` not followed by two hex digits (a truncated escape). If every escape
 * is syntactically well-formed, the failure is an incomplete or invalid
 * multi-byte sequence somewhere in a *run* of escapes, and the best we can
 * honestly say is where that run starts.
 */
function locateBadEscape(input: string): string {
  const percentRe = /%([0-9A-Fa-f]{0,2})/g
  let match: RegExpExecArray | null
  while ((match = percentRe.exec(input))) {
    const hex = match[1] ?? ''
    if (hex.length < 2) {
      return `Malformed escape "${input.slice(match.index, match.index + 3)}" at position ${match.index + 1}: a “%” must be followed by exactly two hex digits.`
    }
  }

  // All escapes are syntactically valid two-digit hex, a UTF-8 sequence
  // problem, not an escape-syntax problem. %C0-%FF opens a multi-byte
  // sequence; report where that run starts.
  const utf8Start = /%[89A-Fa-f][0-9A-Fa-f]/.exec(input)
  if (utf8Start) {
    return `Invalid UTF-8 byte sequence starting at "${utf8Start[0]}", position ${utf8Start.index + 1}: the multi-byte character it begins is incomplete or malformed.`
  }
  return 'Malformed URI sequence: could not identify the exact bad escape.'
}

/**
 * Decodes once, or repeatedly for double/triple-encoded input, capped at
 * `REPEAT_DECODE_CAP` passes so a string that is *always* valid percent-
 * encoding (some Base64url payloads are) cannot loop forever.
 */
export function decodeUrl(text: string, mode: UrlEncodeMode, repeat: boolean): DecodeResult {
  if (text === '') return { ok: true, text: '', passes: 0, hitCap: false }

  let current = text
  let passes = 0
  const maxPasses = repeat ? REPEAT_DECODE_CAP : 1

  // Stop as soon as nothing left could possibly decode further, this both
  // avoids reporting a wasted confirmation pass and is what makes "decode
  // repeatedly" terminate on ordinary once-encoded input after exactly one
  // real pass instead of two. Form mode also unwraps a literal "+", so it
  // keeps looping on that alone even with no "%" left.
  const decodable = (s: string) => s.includes('%') || (mode === 'form' && s.includes('+'))
  while (passes < maxPasses && decodable(current)) {
    const result = decodeOnce(current, mode)
    if (!result.ok) {
      return passes === 0
        ? { ok: false, text: '', error: result.error, passes, hitCap: false }
        : // A later pass failing to decode further just means we are done,
          // return what stabilised, not an error.
          { ok: true, text: current, passes, hitCap: false }
    }
    passes++
    if (result.text === current) break // nothing changed; already stable
    current = result.text
    if (!repeat) break
  }

  const hitCap = repeat && passes === maxPasses && decodable(current)
  return { ok: true, text: current, passes, hitCap }
}

/** Counts characters that differ position-by-position, for a quick "what changed" readout. */
export function countChangedChars(before: string, after: string): number {
  const len = Math.max(before.length, after.length)
  let changed = Math.abs(before.length - after.length)
  const shorter = Math.min(before.length, after.length)
  for (let i = 0; i < shorter; i++) {
    if (before[i] !== after[i]) changed++
  }
  return Math.min(changed, len)
}
