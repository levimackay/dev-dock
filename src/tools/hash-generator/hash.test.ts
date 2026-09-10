import { describe, expect, it } from 'vitest'
import { bytesToHex, compareDigest, crc32, digest, md5 } from './hash'

const utf8 = (s: string) => new TextEncoder().encode(s)
const hex = (bytes: Uint8Array) => bytesToHex(bytes)

describe('md5', () => {
  it('hashes the empty string', () => {
    expect(hex(md5(utf8('')))).toBe('d41d8cd98f00b204e9800998ecf8427e')
  })

  it('hashes "abc"', () => {
    expect(hex(md5(utf8('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72')
  })

  it('hashes the classic pangram', () => {
    expect(hex(md5(utf8('The quick brown fox jumps over the lazy dog')))).toBe(
      '9e107d9d372bb6826bd81d3542a419d6',
    )
  })

  it('hashes input crossing a 64-byte block boundary', () => {
    // 56+ bytes pushes the length-and-padding past one 64-byte block — the classic MD5 edge case.
    const input = 'a'.repeat(63)
    expect(hex(md5(utf8(input)))).toBe('b06521f39153d618550606be297466d5')
  })

  it('hashes multi-byte UTF-8 correctly (hashes bytes, not code units)', () => {
    // md5("café") over its UTF-8 bytes (63 61 66 c3 a9), not its 4 UTF-16 code units.
    expect(hex(md5(utf8('café')))).toBe('07117fe4a1ebd544965dc19573183da2')
  })
})

describe('crc32', () => {
  it('matches the canonical check value for "123456789"', () => {
    expect(hex(crc32(utf8('123456789')))).toBe('cbf43926')
  })

  it('hashes the empty input to zero', () => {
    expect(hex(crc32(utf8('')))).toBe('00000000')
  })
})

describe('digest (Web Crypto algorithms)', () => {
  it('computes SHA-256 of "abc"', async () => {
    const result = await digest('SHA-256', utf8('abc'))
    expect(hex(result)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('computes SHA-1 of "abc"', async () => {
    const result = await digest('SHA-1', utf8('abc'))
    expect(hex(result)).toBe('a9993e364706816aba3e25717850c26c9cd0d89d')
  })

  it('computes SHA-384 and SHA-512 without throwing, at the right lengths', async () => {
    const sha384 = await digest('SHA-384', utf8('abc'))
    const sha512 = await digest('SHA-512', utf8('abc'))
    expect(sha384.length).toBe(48)
    expect(sha512.length).toBe(64)
  })

  it('computes MD5 and CRC32 through the same digest() entry point', async () => {
    const md5Result = await digest('MD5', utf8('abc'))
    const crcResult = await digest('CRC32', utf8('123456789'))
    expect(hex(md5Result)).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(hex(crcResult)).toBe('cbf43926')
  })
})

describe('bytesToHex', () => {
  it('lowercases by default and uppercases on request', () => {
    const bytes = new Uint8Array([0xab, 0xcd])
    expect(bytesToHex(bytes)).toBe('abcd')
    expect(bytesToHex(bytes, true)).toBe('ABCD')
  })
})

describe('compareDigest', () => {
  const digests = {
    MD5: { hex: '900150983cd24fb0d6963f7d28e17f72', hexUpper: '' },
    'SHA-1': { hex: 'a9993e364706816aba3e25717850c26c9cd0d89', hexUpper: '' },
  }

  it('matches by length against the right algorithm', () => {
    const result = compareDigest('900150983cd24fb0d6963f7d28e17f72', digests)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/MD5/)
  })

  it('is case-insensitive and tolerates a 0x prefix', () => {
    const result = compareDigest('0x900150983CD24FB0D6963F7D28E17F72', digests)
    expect(result.ok).toBe(true)
  })

  it('reports no match without leaking which characters differed', () => {
    const result = compareDigest('000000000000000000000000000000', digests)
    expect(result.ok).toBe(false)
    expect(result.message).not.toMatch(/position|character \d/)
  })

  it('rejects empty input', () => {
    expect(compareDigest('', digests).ok).toBe(false)
  })

  it('rejects non-hex input', () => {
    const result = compareDigest('not hex!!', digests)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/hex/)
  })

  it('reports when no algorithm produces a digest of that length', () => {
    const result = compareDigest('abcd', digests)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/4-character/)
  })
})
