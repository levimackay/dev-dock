import { describe, expect, it } from 'vitest'
import {
  decodeBase64,
  encodeBase64,
  looksLikeBase64,
  normalizeBase64,
  toHexDump,
} from './base64'

const opts = { variant: 'standard' as const, lineBreaks: false, padding: true }

describe('encodeBase64', () => {
  it('encodes ASCII', () => {
    expect(encodeBase64('hello', opts)).toBe('aGVsbG8=')
  })

  it('returns empty for empty input', () => {
    expect(encodeBase64('', opts)).toBe('')
  })

  it('encodes multi-byte UTF-8 that btoa alone would reject', () => {
    expect(encodeBase64('héllo — 🌍', opts)).toBe('aMOpbGxvIOKAlCDwn4yN')
  })

  it('uses the URL-safe alphabet when asked', () => {
    // '???>>>' encodes to 'Pz8/Pj4+', which exercises both '/' and '+'.
    const standard = encodeBase64('???>>>', opts)
    expect(standard).toBe('Pz8/Pj4+')
    expect(encodeBase64('???>>>', { ...opts, variant: 'urlsafe' })).toBe('Pz8_Pj4-')
  })

  it('drops padding on request', () => {
    expect(encodeBase64('hello', { ...opts, padding: false })).toBe('aGVsbG8')
  })

  it('wraps at 76 characters for MIME', () => {
    const encoded = encodeBase64('x'.repeat(200), { ...opts, lineBreaks: true })
    for (const line of encoded.split('\n')) expect(line.length).toBeLessThanOrEqual(76)
    expect(encoded).toContain('\n')
  })
})

describe('normalizeBase64', () => {
  it('strips a data URI prefix', () => {
    expect(normalizeBase64('data:image/png;base64,aGk=')).toBe('aGk=')
  })

  it('strips whitespace including newlines', () => {
    expect(normalizeBase64('aGVs\n bG8=')).toBe('aGVsbG8=')
  })

  it('converts the URL-safe alphabet back to standard', () => {
    expect(normalizeBase64('a-b_cd')).toBe('a+b/cd==')
  })

  it('restores missing padding', () => {
    expect(normalizeBase64('aGVsbG8')).toBe('aGVsbG8=')
  })
})

describe('decodeBase64', () => {
  it('decodes ASCII', () => {
    expect(decodeBase64('aGVsbG8=')).toEqual({ ok: true, text: 'hello' })
  })

  it('decodes without padding', () => {
    expect(decodeBase64('aGVsbG8').text).toBe('hello')
  })

  it('round-trips multi-byte UTF-8', () => {
    const text = 'Ђорђе — 🇷🇸'
    expect(decodeBase64(encodeBase64(text, opts)).text).toBe(text)
  })

  it('treats empty input as empty output, not an error', () => {
    expect(decodeBase64('   ')).toEqual({ ok: true, text: '' })
  })

  it('explains a character outside the alphabet, with its position', () => {
    const result = decodeBase64('aGVs!G8=')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/position 5/)
  })

  it('explains a length that cannot be valid Base64', () => {
    const result = decodeBase64('aGVsbG8xy')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Truncated/)
  })

  it('reports binary payloads as a hex dump rather than mojibake', () => {
    // 0xFF 0xFE 0xFD is not valid UTF-8.
    const result = decodeBase64('//79')
    expect(result.ok).toBe(true)
    expect(result.binary).toBe(true)
    expect(result.text).toContain('ff fe fd')
  })
})

describe('toHexDump', () => {
  it('lays out offset, hex, and ASCII columns', () => {
    const dump = toHexDump(new TextEncoder().encode('Hi!'))
    expect(dump).toBe('00000000  48 69 21                                         |Hi!|')
  })

  it('truncates long input and says how much was dropped', () => {
    const dump = toHexDump(new Uint8Array(40), 16)
    expect(dump).toContain('24 more bytes not shown')
  })
})

describe('looksLikeBase64', () => {
  it('accepts a plausible encoded string', () => {
    expect(looksLikeBase64('aGVsbG8gd29ybGQ=')).toBe(true)
  })

  it('rejects ordinary prose', () => {
    expect(looksLikeBase64('hello world, this is a sentence.')).toBe(false)
  })

  it('rejects anything too short to be worth guessing about', () => {
    expect(looksLikeBase64('aGk=')).toBe(false)
  })
})
