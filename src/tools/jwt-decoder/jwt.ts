/**
 * JWT (compact JWS) decoding and optional local HMAC verification.
 *
 * DECODING IS NOT VERIFICATION. Splitting a token into header/payload and
 * base64url-decoding them tells you what the *token claims*, not whether it
 * is genuine: anyone can construct a JWT with any header and payload they
 * like; only a valid signature over the exact bytes proves it came from
 * someone holding the key. A token that merely decodes is not a credential
 * you should trust, and a token you did not issue should never be pasted
 * into a tool or a URL, because a JWT often *is* the credential (a bearer
 * token) and this tool cannot tell a "just curious" paste from a live
 * session token leaking into browser history or a share link.
 */

export interface JwtHeader {
  alg?: string
  typ?: string
  [key: string]: unknown
}

export type JwtPayload = Record<string, unknown>

export interface JwtDecodeResult {
  ok: boolean
  error?: string
  header?: JwtHeader
  headerRaw?: string
  payload?: JwtPayload
  payloadRaw?: string
  signatureB64Url?: string
  /** The exact bytes that were (or should have been) signed: `header.payload`. */
  signingInput?: string
  /** `alg: "none"` is a real, standardised JWS mode, and a classic auth bypass if a verifier honours it. */
  algNone?: boolean
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export type HmacAlgorithm = 'HS256' | 'HS384' | 'HS512'

// Built as a `Set<HmacAlgorithm>` for the literal check, then widened to
// `ReadonlySet<string>`. That widening is the whole trick: `Array.includes` and
// `Set.has` on a narrowly typed collection demand an argument that is already
// the narrow type, which is exactly the question the guard exists to answer, so
// the obvious spelling needs a cast to silence itself. Widening the collection
// instead of casting the argument keeps the list in one place and stays honest.
const HS_ALGORITHMS: ReadonlySet<string> = new Set<HmacAlgorithm>(['HS256', 'HS384', 'HS512'])

export function isHmacAlgorithm(alg: string | undefined): alg is HmacAlgorithm {
  return alg !== undefined && HS_ALGORITHMS.has(alg)
}

/** Decodes base64url (no padding, `-`/`_` alphabet) to a UTF-8 string. Throws on invalid input. */
function base64UrlDecodeText(segment: string): string {
  const standard = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(padded) // throws InvalidCharacterError on bad base64url
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes) // throws on invalid UTF-8
}

function base64UrlDecodeBytes(segment: string): Uint8Array {
  const standard = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = standard + '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const B64URL_RE = /^[A-Za-z0-9_-]*$/

export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim()
  if (trimmed === '') return { ok: false, error: 'Nothing to decode yet.' }

  const segments = trimmed.split('.')
  if (segments.length !== 3) {
    return {
      ok: false,
      error: `A compact JWT has exactly 3 dot-separated segments (header.payload.signature); this has ${segments.length}.`,
    }
  }
  // `segments` is still typed as `string[]` here, not a 3-tuple, even after
  // the length check above, so indexed access is `string | undefined` under
  // `noUncheckedIndexedAccess`. The `?? ''` fallbacks are dead code (length
  // is already known to be exactly 3) but they are what let this destructure
  // without a tuple cast.
  const headerSeg = segments[0] ?? ''
  const payloadSeg = segments[1] ?? ''
  const signatureSeg = segments[2] ?? ''

  for (const [name, seg] of [
    ['header', headerSeg],
    ['payload', payloadSeg],
    ['signature', signatureSeg],
  ] as const) {
    if (!B64URL_RE.test(seg)) {
      return {
        ok: false,
        error: `The ${name} segment is not valid base64url, it contains a character outside A-Z, a-z, 0-9, "-", "_".`,
      }
    }
  }

  let headerRaw: string
  try {
    headerRaw = base64UrlDecodeText(headerSeg)
  } catch {
    return {
      ok: false,
      error:
        'The header segment could not be base64url-decoded (invalid encoding or invalid UTF-8).',
    }
  }

  // The parsed value is typed as `JwtHeader` here, and that type is a claim
  // about what a well-formed token contains, not a fact about this string. The
  // token came from a text box. Two things follow, and both are enforced below
  // rather than assumed:
  //
  //   - the value may not be an object at all. `"null"`, `"[]"` and `"3"` are
  //     all valid JSON, so `isPlainObject` runs before any field is read.
  //   - individual fields may be any type or absent, so each is read through
  //     its own `typeof` check at the point of use.
  //
  // The single `as` is the visible seam between "some JSON value" and "the
  // shape the rest of this function talks about". Everything after it earns
  // that shape by checking.
  let parsedHeader: unknown
  try {
    parsedHeader = JSON.parse(headerRaw)
  } catch {
    return {
      ok: false,
      error: 'The header decodes fine as base64url, but is not valid JSON.',
      headerRaw,
    }
  }

  // `"null"`, `"[]"` and `"3"` are all valid JSON, so a segment can decode and
  // parse and still not be a header. `bnVsbA.e30.x` is the shortest example:
  // without this check, reading `.alg` off it later throws into render.
  if (!isPlainObject(parsedHeader)) {
    return {
      ok: false,
      error:
        'The header decodes and parses, but it is not a JSON object. A JWT header must be an object such as {"alg":"HS256","typ":"JWT"}.',
      headerRaw,
    }
  }
  const header: JwtHeader = parsedHeader

  let payloadRaw: string
  try {
    payloadRaw = base64UrlDecodeText(payloadSeg)
  } catch {
    return {
      ok: false,
      error:
        'The payload segment could not be base64url-decoded (invalid encoding or invalid UTF-8).',
      header,
      headerRaw,
    }
  }

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(payloadRaw)
  } catch {
    return {
      ok: false,
      error: 'The payload decodes fine as base64url, but is not valid JSON.',
      header,
      headerRaw,
      payloadRaw,
    }
  }

  if (!isPlainObject(parsedPayload)) {
    return {
      ok: false,
      error:
        'The payload decodes and parses, but it is not a JSON object. A JWT payload must be an object of claims.',
      header,
      headerRaw,
      payloadRaw,
    }
  }
  const payload: JwtPayload = parsedPayload

  const algNone = typeof header.alg === 'string' && header.alg.toLowerCase() === 'none'

  return {
    ok: true,
    header,
    headerRaw,
    payload,
    payloadRaw,
    signatureB64Url: signatureSeg,
    signingInput: `${headerSeg}.${payloadSeg}`,
    algNone,
  }
}

/* ------------------------------------------------------- claim readability */

export type ClaimTimeState = 'expired' | 'not-yet-valid' | 'valid' | 'n/a'

export interface ClaimTime {
  epochSeconds: number
  absolute: string
  relative: string
}

/** `exp`/`nbf`/`iat` are Unix seconds per RFC 7519 §2, not milliseconds, the universal off-by-1000x bug. */
export function readClaimTime(value: unknown): ClaimTime | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const ms = value * 1000
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return undefined
  return {
    epochSeconds: value,
    absolute: date.toLocaleString(),
    relative: formatRelative(ms, Date.now()),
  }
}

export function formatRelative(targetMs: number, nowMs: number): string {
  const diffSeconds = Math.round((targetMs - nowMs) / 1000)
  const future = diffSeconds >= 0
  const abs = Math.abs(diffSeconds)

  const units: Array<[number, string]> = [
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
    [1, 'second'],
  ]
  for (const [secs, label] of units) {
    if (abs >= secs || secs === 1) {
      const n = Math.max(1, Math.round(abs / secs))
      const plural = n === 1 ? label : `${label}s`
      return future ? `in ${n} ${plural}` : `${n} ${plural} ago`
    }
  }
  return future ? 'in a moment' : 'just now'
}

/** Expiry state used to colour the exp/nbf stats. `now` is injectable for tests. */
export function expiryState(payload: JwtPayload, now = Date.now()): ClaimTimeState {
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : undefined
  const nbf = typeof payload.nbf === 'number' ? payload.nbf * 1000 : undefined
  if (exp !== undefined && now >= exp) return 'expired'
  if (nbf !== undefined && now < nbf) return 'not-yet-valid'
  if (exp !== undefined || nbf !== undefined) return 'valid'
  return 'n/a'
}

/* ------------------------------------------------------------ verification */

export interface VerifyResult {
  ok: boolean
  match?: boolean
  error?: string
}

const SUBTLE_HASH: Record<HmacAlgorithm, string> = {
  HS256: 'SHA-256',
  HS384: 'SHA-384',
  HS512: 'SHA-512',
}

/**
 * Verifies an HS256/384/512 signature with Web Crypto. RS-, ES-, and PS-
 * family algorithms are deliberately not offered: those are asymmetric algorithms verified against
 * a *public key*, not a shared secret, and need a different input (a JWK or
 * PEM key, plus algorithm-specific padding/curve handling) and a different
 * code path. Faking that with the wrong primitive would silently "verify"
 * against the wrong thing, which is worse than not offering it.
 */
export async function verifyHmacSignature(
  signingInput: string,
  signatureB64Url: string,
  secret: string,
  alg: HmacAlgorithm,
): Promise<VerifyResult> {
  if (secret === '') return { ok: false, error: 'Enter a secret to verify against.' }

  let expected: Uint8Array
  try {
    expected = base64UrlDecodeBytes(signatureB64Url)
  } catch {
    return { ok: false, error: 'The signature segment is not valid base64url.' }
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: SUBTLE_HASH[alg] },
    false,
    ['sign'],
  )
  const computed = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput)),
  )

  return { ok: true, match: constantTimeEqual(computed, expected) }
}

/**
 * Byte-for-byte comparison that does not short-circuit on the first
 * mismatch. A naive `===`/`Array.every` return-on-first-difference comparison
 * leaks timing information proportional to how many leading bytes matched,
 * which is a real (if slow) oracle for guessing a signature byte by byte.
 * This always walks every byte of the longer array before answering. It is
 * "constant-time-ish": JS gives no hard timing guarantees, but this removes
 * the obvious early-exit leak.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

/* ------------------------------------------------------------- sample data */

/**
 * A real HS256-signed token, generated at build time against the documented
 * secret below so the Sample button demonstrates the whole tool, verification
 * included: not just decoding.
 *
 *   header:  {"alg":"HS256","typ":"JWT"}
 *   payload: {"sub":"1234567890","name":"Ada Lovelace","iss":"dev-dock",
 *             "iat":1730000000,"exp":4102444800}
 *   secret:  "dev-dock-sample-secret"
 */
export const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImlzcyI6ImRldi1kb2NrIiwiaWF0IjoxNzMwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.UPusCwFUa0JD2ZUWXswJW8U2Oo1sJnUnxBCkr-nR-9o'
export const SAMPLE_JWT_SECRET = 'dev-dock-sample-secret'
