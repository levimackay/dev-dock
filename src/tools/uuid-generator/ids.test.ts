import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_NANOID_ALPHABET,
  decodeUuid,
  formatBulk,
  generateNanoId,
  generateUlid,
  generateUuidV4,
  generateUuidV7,
} from './ids'

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

afterEach(() => {
  vi.restoreAllMocks()
})

describe('generateUuidV4', () => {
  it('produces the standard 8-4-4-4-12 shape', () => {
    expect(generateUuidV4()).toMatch(UUID_SHAPE)
  })

  it('sets the version nibble to 4', () => {
    expect(generateUuidV4()[14]).toBe('4')
  })

  it('sets the variant bits to the RFC 4122 pattern (10xx)', () => {
    const variantChar = generateUuidV4()[19]!
    expect('89ab').toContain(variantChar)
  })

  it('generates different ids on successive calls', () => {
    expect(generateUuidV4()).not.toBe(generateUuidV4())
  })
})

describe('generateUuidV7', () => {
  it('produces the standard shape with version 7', () => {
    const id = generateUuidV7(1_700_000_000_000)
    expect(id).toMatch(UUID_SHAPE)
    expect(id[14]).toBe('7')
  })

  it('sorts lexicographically in generation order when timestamps differ', () => {
    const earlier = generateUuidV7(1_000)
    const later = generateUuidV7(2_000)
    expect(earlier < later).toBe(true)
  })

  it('round-trips its embedded timestamp through decodeUuid', () => {
    const ms = 1_700_000_000_123
    const id = generateUuidV7(ms)
    const decoded = decodeUuid(id)
    expect(decoded.timestamp?.getTime()).toBe(ms)
  })
})

describe('generateNanoId', () => {
  it('defaults to 21 characters from the default alphabet', () => {
    const id = generateNanoId()
    expect(id).toHaveLength(21)
    for (const char of id) expect(DEFAULT_NANOID_ALPHABET).toContain(char)
  })

  it('honours a custom length', () => {
    expect(generateNanoId(8)).toHaveLength(8)
  })

  it('only uses characters from a custom alphabet', () => {
    const id = generateNanoId(30, 'AB')
    expect(id).toHaveLength(30)
    expect(/^[AB]+$/.test(id)).toBe(true)
  })

  it('rejects a biased high byte instead of using it, to avoid modulo bias', () => {
    // Alphabet length 3 does not divide 256 evenly: limit = 256 - (256%3) = 255.
    // A byte of 255 must be discarded rather than mapped via 255 % 3.
    const queue = [255, 0, 1, 2] // 255 rejected; 0,1,2 -> 'A','B','C'
    let cursor = 0
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) array[i] = queue[cursor++] ?? 0
      return array
    }) as typeof crypto.getRandomValues)

    expect(generateNanoId(3, 'ABC')).toBe('ABC')
  })

  it('throws on an empty alphabet rather than looping forever', () => {
    expect(() => generateNanoId(5, '')).toThrow()
  })
})

describe('generateUlid', () => {
  it('produces 26 Crockford Base32 characters', () => {
    const id = generateUlid(1_700_000_000_000)
    expect(id).toHaveLength(26)
    expect(/^[0-9A-HJKMNP-TV-Z]+$/.test(id)).toBe(true)
  })

  it('excludes the confusable letters I, L, O, U', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateUlid()
      expect(/[ILOU]/.test(id)).toBe(false)
    }
  })

  it('sorts lexicographically in generation order when timestamps differ', () => {
    expect(generateUlid(1_000) < generateUlid(2_000)).toBe(true)
  })
})

describe('decodeUuid', () => {
  it('reports version and variant for a v4 id', () => {
    const decoded = decodeUuid(generateUuidV4())
    expect(decoded.ok).toBe(true)
    expect(decoded.version).toBe(4)
    expect(decoded.variant).toBe('RFC 4122 / RFC 9562')
    expect(decoded.timestamp).toBeUndefined()
  })

  it('accepts brace-wrapped and hyphen-free input', () => {
    const id = generateUuidV4()
    const braced = `{${id}}`
    const bare = id.replace(/-/g, '')
    expect(decodeUuid(braced).ok).toBe(true)
    expect(decodeUuid(bare).ok).toBe(true)
    expect(decodeUuid(bare).canonical).toBe(id)
  })

  it('rejects the wrong number of hex characters, naming the count found', () => {
    const result = decodeUuid('not-a-uuid')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/32 hex characters/)
  })

  it('rejects empty input', () => {
    expect(decodeUuid('').error).toMatch(/Paste a UUID/)
  })

  it('decodes a v1 timestamp back to the exact millisecond it was built from', () => {
    // Hand-derived fixture: 1998-06-15T12:00:00Z (897912000000 ms) converted
    // to 100ns intervals since the UUID clock epoch (1582-10-15) and laid
    // out as v1's time_low : time_mid : time_hi field order.
    const decoded = decodeUuid('5d802000-0448-11d2-8222-08002b34c003')
    expect(decoded.version).toBe(1)
    expect(decoded.timestamp?.getTime()).toBe(897_912_000_000)
  })

  it('decodes a v6 timestamp back to the exact millisecond it was built from', () => {
    // Same instant as the v1 fixture above, re-laid-out in v6's sortable
    // time_high : time_mid : time_low field order.
    const decoded = decodeUuid('1d204485-d802-6000-8222-08002b34c003')
    expect(decoded.version).toBe(6)
    expect(decoded.timestamp?.getTime()).toBe(897_912_000_000)
  })
})

describe('formatBulk', () => {
  const ids = ['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'ffffffff-0000-7111-9222-333333333333']
  const base = {
    uppercase: false,
    noHyphens: false,
    braces: false,
    quoted: false,
    commaSeparated: false,
    sql: false,
    json: false,
  }

  it('joins with newlines by default', () => {
    expect(formatBulk(ids, base)).toBe(ids.join('\n'))
  })

  it('applies uppercase, no-hyphens, and braces together', () => {
    const out = formatBulk(ids, { ...base, uppercase: true, noHyphens: true, braces: true })
    expect(out.split('\n')[0]).toBe(`{${ids[0]!.replace(/-/g, '').toUpperCase()}}`)
  })

  it('quotes and comma-separates', () => {
    const out = formatBulk(ids, { ...base, quoted: true, commaSeparated: true })
    expect(out).toBe(`"${ids[0]}", "${ids[1]}"`)
  })

  it('renders a JSON array', () => {
    expect(formatBulk(ids, { ...base, json: true })).toBe(JSON.stringify(ids, null, 2))
  })

  it('renders a SQL insert list', () => {
    const out = formatBulk(ids, { ...base, sql: true })
    expect(out).toContain('INSERT INTO your_table')
    expect(out).toContain(`('${ids[0]}')`)
  })
})
