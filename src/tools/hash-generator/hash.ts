/**
 * Hashing: SHA-1/256/384/512 via Web Crypto, plus MD5 and CRC32 hand-rolled.
 *
 * Web Crypto's `subtle.digest` covers the SHA-2 family and SHA-1, but not MD5
 * or CRC32 — neither is in the SubtleCrypto spec, because neither is
 * considered a cryptographic hash worth standardising a browser API around.
 * MD5 and SHA-1 are both broken for *security* use (practical collision
 * attacks exist for both), and are implemented here only because they are
 * still what a lot of legacy tooling, package checksums, and "does this file
 * match" comparisons use — the UI says so next to their rows.
 *
 * CRC32 is not a cryptographic hash at all; it is an error-detecting
 * checksum (used by zip/png/ethernet) that is trivial to forge. It is here
 * purely for checksum comparison, not for anything resembling integrity
 * against a motivated attacker.
 */

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'CRC32'

export const ALGORITHMS: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512', 'CRC32']

/** Algorithms with known practical attacks — flagged in the UI, not hidden here. */
export const BROKEN_ALGORITHMS = new Set<HashAlgorithm>(['MD5', 'SHA-1'])

export function bytesToHex(bytes: Uint8Array, uppercase = false): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const hex = (bytes[i] ?? 0).toString(16).padStart(2, '0')
    out += hex
  }
  return uppercase ? out.toUpperCase() : out
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

const SUBTLE_NAMES: Partial<Record<HashAlgorithm, string>> = {
  'SHA-1': 'SHA-1',
  'SHA-256': 'SHA-256',
  'SHA-384': 'SHA-384',
  'SHA-512': 'SHA-512',
}

/**
 * Takes a `Uint8Array` rather than an `ArrayBuffer` on purpose: Web Crypto's
 * `BufferSource` accepts a typed array directly, and a `Uint8Array`'s own
 * `.buffer` is typed `ArrayBufferLike` (it could back onto a
 * `SharedArrayBuffer`), which would force a cast at every call site for no
 * benefit — every caller here already has bytes, never a raw buffer.
 */
export async function digest(
  algorithm: HashAlgorithm,
  data: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const subtleName = SUBTLE_NAMES[algorithm]
  if (subtleName) {
    return new Uint8Array(await crypto.subtle.digest(subtleName, data))
  }
  if (algorithm === 'MD5') return md5(data)
  return crc32(data)
}

/* ----------------------------------------------------------------- CRC32 */

let crc32Table: Uint32Array | undefined

/** Built once on first use, not at module load, for the rare tab that never hashes anything. */
function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crc32Table = table
  return table
}

/** Returns the CRC32 checksum as 4 big-endian bytes, matching how it is normally displayed as hex. */
export function crc32(bytes: Uint8Array): Uint8Array {
  const table = getCrc32Table()
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0
    crc = (table[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8)
  }
  crc = (crc ^ 0xffffffff) >>> 0
  return new Uint8Array([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff])
}

/* -------------------------------------------------------------------- MD5 */
// RFC 1321. Written directly against the spec's per-round shift/constant
// tables rather than pulled from a library, since the whole point of this
// file is that MD5 is a small enough algorithm to read start to finish.

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
]

// K[i] = floor(abs(sin(i + 1)) * 2^32), precomputed per the spec.
const K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8,
  0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87,
  0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039,
  0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
  0xeb86d391,
])

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n))
}

export function md5(bytes: Uint8Array): Uint8Array {
  // Pad per the spec: a single 1 bit, zeros, then the original bit length as
  // a 64-bit little-endian integer, ending on a 64-byte boundary.
  const bitLen = bytes.length * 8
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLen)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  // bitLen fits in 32 bits for anything under 512 MiB, which the file cap
  // downstream (64 MiB) guarantees — the upper 32 bits of the 64-bit length
  // are always zero here.
  view.setUint32(paddedLen - 8, bitLen >>> 0, true)
  view.setUint32(paddedLen - 4, 0, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const M = new Uint32Array(16)
  for (let chunkStart = 0; chunkStart < paddedLen; chunkStart += 64) {
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(chunkStart + i * 4, true)

    let a = a0,
      b = b0,
      c = c0,
      d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + (K[i] ?? 0) + (M[g] ?? 0)) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(f, S[i] ?? 0)) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const out = new Uint8Array(16)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, a0 >>> 0, true)
  outView.setUint32(4, b0 >>> 0, true)
  outView.setUint32(8, c0 >>> 0, true)
  outView.setUint32(12, d0 >>> 0, true)
  return out
}

/* ------------------------------------------------------------- comparison */

export interface CompareResult {
  ok: boolean
  message: string
}

/**
 * Compares an expected digest against every computed digest, matching by
 * length rather than assuming which algorithm the user meant — a 32-char hex
 * string is unambiguously MD5-shaped among these algorithms, a 40-char one
 * is SHA-1-shaped, and so on. The response never says *which specific
 * characters* differed, only match/no-match, so this cannot be used as an
 * oracle to guess a hash byte by byte the way a diff view could.
 */
export function compareDigest(
  expected: string,
  digests: Partial<Record<HashAlgorithm, { hex: string; hexUpper: string }>>,
): CompareResult {
  const cleaned = expected.trim().toLowerCase().replace(/^0x/, '')
  if (cleaned === '') return { ok: false, message: 'Enter a digest to compare.' }
  if (!/^[0-9a-f]+$/.test(cleaned)) {
    return { ok: false, message: 'Not a hex digest — only 0-9 and a-f are expected.' }
  }

  // Walk the fixed algorithm list rather than `Object.entries(digests)` so the
  // key stays typed as `HashAlgorithm` throughout — no cast needed to recover
  // what `Object.entries` would otherwise widen to `string`.
  for (const algorithm of ALGORITHMS) {
    const value = digests[algorithm]
    if (!value || value.hex.length !== cleaned.length) continue
    const matches = hexEqualConstantTime(cleaned, value.hex)
    return {
      ok: matches,
      message: matches ? `Matches ${algorithm}.` : `Does not match ${algorithm} (the only algorithm at this length).`,
    }
  }
  return { ok: false, message: `No algorithm here produces a ${cleaned.length}-character digest.` }
}

/** Same rationale as the JWT tool's byte comparison: never exit early on the first mismatch. */
function hexEqualConstantTime(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
