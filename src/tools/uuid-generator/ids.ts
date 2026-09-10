/**
 * ID generation: UUID v4, UUID v7, NanoID, and ULID, plus a decoder that
 * reads a pasted UUID back apart.
 *
 * SECURITY: every generator below draws its randomness from
 * `crypto.getRandomValues`, the platform CSPRNG (cryptographically secure
 * pseudo-random number generator), never `Math.random()`. `Math.random()` is
 * specified only to be "approximately uniform", most engines back it with a
 * fast, non-cryptographic PRNG (xorshift128+ in V8) whose output can be
 * predicted from a handful of samples. That is irrelevant for a dice-roll
 * animation and disqualifying for anything used as an identifier that must
 * not be guessable (a session token embedded in a UUID field, a password-
 * reset id, a NanoID used as a share-link slug). Using the CSPRNG
 * unconditionally here means nobody has to remember which call site was the
 * sensitive one later.
 */

// ------------------------------------------------------------------ shared

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

function formatUuidHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

// -------------------------------------------------------------- UUID v4

/**
 * Uses the platform's own `crypto.randomUUID()` where it exists (every
 * evergreen browser since 2022). The manual fallback below is what that
 * function is doing internally, spelled out: 16 random bytes, then the four
 * version bits and the two variant bits are overwritten per RFC 4122 §4.4,
 * everything else in the UUID stays random. Version 4 means "no meaning in
 * this UUID besides being random"; the variant bits (`10` in the top two
 * bits of byte 8) mark it as an RFC 4122 UUID rather than one of the three
 * legacy variants (NCS, Microsoft, future/reserved).
 */
export function generateUuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = randomBytes(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40 // top nibble of byte 6 -> 0100 (version 4)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // top two bits of byte 8 -> 10 (RFC 4122 variant)
  return formatUuidHex(bytesToHex(bytes))
}

// -------------------------------------------------------------- UUID v7

/**
 * UUID v7 (RFC 9562): a 48-bit big-endian Unix millisecond timestamp in the
 * first 6 bytes, then the version and variant bits, then random bits filling
 * the rest.
 *
 * The reason v7 exists at all: a v4 UUID is uniformly random, which means a
 * database index built on it (a B-tree, which is what a primary-key index
 * almost always is) gets an insert at a random leaf every time, no
 * locality, constant page splits, and a working set that never fits in
 * cache. A v7 UUID sorts by creation time because its high-order bits *are*
 * a timestamp, so inserts land at the right edge of the index the way an
 * auto-increment integer always did, while the low-order random bits still
 * make it infeasible to guess or enumerate. It is the "have both" answer to
 * "UUID or auto-increment ID".
 */
export function generateUuidV7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16)
  const ts = BigInt(Math.max(0, Math.floor(now)))
  for (let i = 0; i < 6; i++) {
    bytes[i] = Number((ts >> BigInt((5 - i) * 8)) & 0xffn)
  }

  // 10 random bytes cover: 4 bits into byte 6 (rand_a high nibble), all of
  // byte 7 (rand_a low byte), 12 bits of rand_a total, then 6 bits into
  // byte 8 plus all of bytes 9-15 for the 62 bits of rand_b.
  const rnd = randomBytes(10)
  bytes[6] = 0x70 | (rnd[0]! & 0x0f) // version 7
  bytes[7] = rnd[1]!
  bytes[8] = 0x80 | (rnd[2]! & 0x3f) // RFC 4122 variant
  for (let i = 0; i < 7; i++) bytes[9 + i] = rnd[3 + i]!

  return formatUuidHex(bytesToHex(bytes))
}

// -------------------------------------------------------------- NanoID

export const DEFAULT_NANOID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
export const DEFAULT_NANOID_LENGTH = 21

/**
 * Generates a NanoID: `length` characters drawn uniformly from `alphabet`.
 *
 * The naive approach, `alphabet[randomByte % alphabet.length]`, is biased
 * whenever `alphabet.length` does not divide 256 evenly. Take a 62-character
 * alphabet: 256 = 4×62 + 8, so indices 0 through 7 are each reachable from five
 * byte values and indices 8 through 61 from only four. The first eight
 * characters win the modulo lottery, about 25% more often than the rest. Small,
 * real, and exactly the sort of statistical tell that rejection sampling closes
 * for almost nothing.
 *
 * The fix is to compute the largest multiple of `alphabet.length` that fits in
 * a byte (`limit`), and to throw away and re-roll any byte at or above it. The
 * remaining values divide evenly, so every index is equally likely.
 *
 * The default 64-character alphabet was chosen so that 256 divides it exactly
 * and the rejection branch never triggers; it only costs anything once a caller
 * supplies an alphabet of their own.
 */

/** Above this the rejection-sampling limit degenerates to zero. */
export const MAX_NANOID_ALPHABET = 256

/** Well past any real identifier, and short of anything that would block the tab. */
export const MAX_NANOID_LENGTH = 512

export function generateNanoId(
  length: number = DEFAULT_NANOID_LENGTH,
  alphabet: string = DEFAULT_NANOID_ALPHABET,
): string {
  if (alphabet.length === 0) throw new Error('NanoID alphabet must not be empty.')
  // Above 256 the rejection limit computes to 0 and every byte is rejected, so
  // the loop below never terminates. Widening to two bytes per character would
  // fix that, but a 256-symbol alphabet is already far past anything anyone
  // uses, so the honest answer is to refuse rather than to invent a mode.
  if (alphabet.length > MAX_NANOID_ALPHABET) {
    throw new Error(
      `NanoID alphabet must be ${MAX_NANOID_ALPHABET} characters or fewer; this one has ${alphabet.length}.`,
    )
  }
  if (length <= 0) return ''
  if (length > MAX_NANOID_LENGTH) {
    throw new Error(`NanoID length must be ${MAX_NANOID_LENGTH} or fewer characters.`)
  }

  const limit = 256 - (256 % alphabet.length)
  let result = ''
  while (result.length < length) {
    const batch = randomBytes(length - result.length)
    for (const byte of batch) {
      if (byte >= limit) continue // reject: would bias toward the low indices
      result += alphabet[byte % alphabet.length]
      if (result.length === length) break
    }
  }
  return result
}

// ---------------------------------------------------------------- ULID

/** Crockford's Base32: excludes I, L, O, U to avoid confusion with 1, 1, 0, V when read aloud or handwritten. */
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function toBase32(value: bigint, digits: number): string {
  let out = ''
  let v = value
  for (let i = 0; i < digits; i++) {
    out = CROCKFORD_BASE32[Number(v % 32n)] + out
    v /= 32n
  }
  return out
}

/**
 * ULID: a 48-bit millisecond timestamp (10 Crockford Base32 characters)
 * followed by 80 bits of randomness (16 more characters), 26 characters
 * total. Like UUID v7, encoding the timestamp first makes IDs generated in
 * order sort as strings in that same order; unlike v7 it is not constrained
 * to the UUID's specific byte layout, which is why it reads as plain Base32
 * rather than the familiar 8-4-4-4-12 hex grouping.
 */
export function generateUlid(now: number = Date.now()): string {
  const timePart = toBase32(BigInt(Math.max(0, Math.floor(now))), 10)

  const bytes = randomBytes(10) // 80 bits
  let randomValue = 0n
  for (const b of bytes) randomValue = (randomValue << 8n) | BigInt(b)
  const randomPart = toBase32(randomValue, 16)

  return timePart + randomPart
}

// ------------------------------------------------------------- decoding

export type UuidVariant =
  'NCS backward compatible' | 'RFC 4122 / RFC 9562' | 'Microsoft (reserved)' | 'Future (reserved)'

export interface UuidDecodeResult {
  ok: boolean
  error?: string
  canonical?: string
  version?: number
  variant?: UuidVariant
  /** Only present for the time-based versions (1, 6, 7). */
  timestamp?: Date
}

function describeVariant(nibble: number): UuidVariant {
  // The variant lives in the top 1-3 bits of this nibble, not the whole
  // thing, RFC 4122 §4.1.1 defines it as a variable-width prefix code.
  if ((nibble & 0b1000) === 0) return 'NCS backward compatible'
  if ((nibble & 0b1100) === 0b1000) return 'RFC 4122 / RFC 9562'
  if ((nibble & 0b1110) === 0b1100) return 'Microsoft (reserved)'
  return 'Future (reserved)'
}

/** 100-nanosecond intervals between the UUID clock epoch (1582-10-15, the Gregorian calendar's adoption) and the Unix epoch (1970-01-01). The classic, slightly absurd constant every v1 UUID implementation carries. */
const GREGORIAN_TO_UNIX_100NS = 122_192_928_000_000_000n

function fromGregorian100ns(intervals: bigint): Date {
  const unixMs = (intervals - GREGORIAN_TO_UNIX_100NS) / 10_000n
  return new Date(Number(unixMs))
}

/** v1 lays the 60-bit clock value out as time_low(32) : time_mid(16) : time_hi(12), read from the fields in that significance order. */
function decodeV1Timestamp(hex: string): Date {
  const timeLow = hex.slice(0, 8)
  const timeMid = hex.slice(8, 12)
  const timeHi = (parseInt(hex.slice(12, 16), 16) & 0x0fff).toString(16).padStart(3, '0')
  return fromGregorian100ns(BigInt(`0x${timeHi}${timeMid}${timeLow}`))
}

/** v6 reorders the same 60-bit clock value into time_high(32) : time_mid(16) : time_low(12), so that, unlike v1, the bytes sort chronologically. */
function decodeV6Timestamp(hex: string): Date {
  const timeHighA = hex.slice(0, 8)
  const timeHighB = hex.slice(8, 12)
  const timeLow = (parseInt(hex.slice(12, 16), 16) & 0x0fff).toString(16).padStart(3, '0')
  return fromGregorian100ns(BigInt(`0x${timeHighA}${timeHighB}${timeLow}`))
}

function decodeV7Timestamp(hex: string): Date {
  return new Date(Number(BigInt(`0x${hex.slice(0, 12)}`)))
}

/** Accepts hyphenated, brace-wrapped, or bare-hex UUIDs and explains a malformed one rather than just failing. */
export function decodeUuid(input: string): UuidDecodeResult {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: false, error: 'Paste a UUID to decode.' }

  const stripped = trimmed.replace(/^[{[]|[}\]]$/g, '').replace(/-/g, '')
  if (!/^[0-9a-fA-F]{32}$/.test(stripped)) {
    return {
      ok: false,
      error: `"${trimmed}" is not a UUID, expected 32 hex characters, with or without hyphens or braces, found ${stripped.length} usable hex characters.`,
    }
  }

  const hex = stripped.toLowerCase()
  const version = parseInt(hex[12]!, 16)
  const variant = describeVariant(parseInt(hex[16]!, 16))

  let timestamp: Date | undefined
  if (version === 1) timestamp = decodeV1Timestamp(hex)
  else if (version === 6) timestamp = decodeV6Timestamp(hex)
  else if (version === 7) timestamp = decodeV7Timestamp(hex)

  return { ok: true, canonical: formatUuidHex(hex), version, variant, timestamp }
}

// ------------------------------------------------------------ bulk format

export interface BulkFormatOptions {
  uppercase: boolean
  noHyphens: boolean
  braces: boolean
  quoted: boolean
  commaSeparated: boolean
  sql: boolean
  json: boolean
}

export const DEFAULT_BULK_FORMAT: BulkFormatOptions = {
  uppercase: false,
  noHyphens: false,
  braces: false,
  quoted: false,
  commaSeparated: false,
  sql: false,
  json: false,
}

/** Applies the per-id cosmetic options, then the whole-output shape (plain lines, a JSON array, or a SQL VALUES list). `sql` and `json` take priority over the line-based options since they define the entire output, not just how each id looks. */
export function formatBulk(ids: string[], options: BulkFormatOptions): string {
  const items = ids.map((id) => {
    let value = options.noHyphens ? id.replace(/-/g, '') : id
    if (options.uppercase) value = value.toUpperCase()
    if (options.braces) value = `{${value}}`
    return value
  })

  if (options.json) return JSON.stringify(items, null, 2)
  if (options.sql) {
    const values = items.map((value) => `  ('${value}')`).join(',\n')
    return `INSERT INTO your_table (id) VALUES\n${values};`
  }

  const rendered = options.quoted ? items.map((value) => `"${value}"`) : items
  return rendered.join(options.commaSeparated ? ', ' : '\n')
}
