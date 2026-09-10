import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, normalizeBase64Url } from './base64'

const bytes = (...values: number[]) => new Uint8Array(values)

describe('bytesToBase64', () => {
  it('encodes an empty array', () => {
    expect(bytesToBase64(bytes())).toBe('')
  })

  it('encodes ASCII', () => {
    expect(bytesToBase64(new TextEncoder().encode('hello'))).toBe('aGVsbG8=')
  })

  it('uses the URL-safe alphabet and drops padding when asked', () => {
    const source = new TextEncoder().encode('???>>>')
    expect(bytesToBase64(source)).toBe('Pz8/Pj4+')
    expect(bytesToBase64(source, true)).toBe('Pz8_Pj4-')
  })

  it('handles input far past the spread-argument limit', () => {
    // The reason the chunk loop exists. A single spread of this many arguments
    // throws RangeError on every engine we target.
    const large = new Uint8Array(300_000).fill(65)
    expect(() => bytesToBase64(large)).not.toThrow()
    expect(bytesToBase64(large).length).toBe(400_000)
  })

  it('round-trips a large buffer exactly', () => {
    const source = new Uint8Array(200_000)
    for (let i = 0; i < source.length; i++) source[i] = i % 256
    expect(base64ToBytes(bytesToBase64(source))).toEqual(source)
  })
})

describe('normalizeBase64Url', () => {
  it('converts the URL-safe alphabet back to standard', () => {
    expect(normalizeBase64Url('a-b_cd')).toBe('a+b/cd==')
  })

  it('restores one padding character for a remainder of 3', () => {
    expect(normalizeBase64Url('aGVsbG8')).toBe('aGVsbG8=')
  })

  it('leaves an already-padded string alone', () => {
    expect(normalizeBase64Url('aGVsbG8=')).toBe('aGVsbG8=')
  })

  it('leaves an impossible length alone rather than repairing it', () => {
    // Remainder 1 is not a valid Base64 length; padding it would turn a
    // detectable error into wrong bytes.
    expect(normalizeBase64Url('aGVsbG8xy')).toBe('aGVsbG8xy')
  })
})

describe('base64ToBytes', () => {
  it('decodes standard Base64', () => {
    expect(new TextDecoder().decode(base64ToBytes('aGVsbG8='))).toBe('hello')
  })

  it('decodes URL-safe Base64 without padding', () => {
    expect(new TextDecoder().decode(base64ToBytes('aGVsbG8'))).toBe('hello')
  })

  it('throws on a character outside the alphabet', () => {
    expect(() => base64ToBytes('aGVs!G8=')).toThrow()
  })
})
