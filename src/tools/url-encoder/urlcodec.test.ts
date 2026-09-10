import { describe, expect, it } from 'vitest'
import { REPEAT_DECODE_CAP, countChangedChars, decodeUrl, encodeUrl } from './urlcodec'

describe('encodeUrl', () => {
  it('component mode escapes reserved URL structure characters', () => {
    expect(encodeUrl('a=b&c=d?e', 'component')).toBe('a%3Db%26c%3Dd%3Fe')
  })

  it('full mode leaves URL structure characters alone', () => {
    expect(encodeUrl('https://example.com/a b?x=1&y=2', 'full')).toBe(
      'https://example.com/a%20b?x=1&y=2',
    )
  })

  it('form mode encodes a space as + instead of %20', () => {
    expect(encodeUrl('a b', 'form')).toBe('a+b')
  })

  it('form mode still percent-encodes a literal +', () => {
    expect(encodeUrl('a+b', 'form')).toBe('a%2Bb')
  })

  it('handles empty input', () => {
    expect(encodeUrl('', 'component')).toBe('')
  })

  it('round-trips multi-byte UTF-8', () => {
    const text = 'héllo 🌍'
    expect(decodeUrl(encodeUrl(text, 'component'), 'component', false).text).toBe(text)
  })
})

describe('decodeUrl', () => {
  it('decodes a component-encoded string', () => {
    expect(decodeUrl('a%3Db', 'component', false)).toEqual({
      ok: true,
      text: 'a=b',
      passes: 1,
      hitCap: false,
    })
  })

  it('treats empty input as empty output, not an error', () => {
    expect(decodeUrl('', 'component', false)).toEqual({ ok: true, text: '', passes: 0, hitCap: false })
  })

  it('turns + into a space in form mode', () => {
    expect(decodeUrl('a+b', 'form', false).text).toBe('a b')
  })

  it('leaves + alone outside form mode', () => {
    expect(decodeUrl('a+b', 'component', false).text).toBe('a+b')
  })

  it('reports a truncated percent escape with its position', () => {
    // %E0%A4%A is a 3-byte UTF-8 lead byte followed by a chopped-off final escape.
    const result = decodeUrl('%E0%A4%A', 'component', false)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/position 7/)
  })

  it('reports a percent not followed by two hex digits', () => {
    const result = decodeUrl('100%', 'component', false)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/position 4/)
  })

  it('decodes repeatedly when asked, for double-encoded input', () => {
    const doubleEncoded = encodeUrl(encodeUrl('a=b&c', 'component'), 'component')
    const result = decodeUrl(doubleEncoded, 'component', true)
    expect(result.ok).toBe(true)
    expect(result.text).toBe('a=b&c')
    expect(result.passes).toBe(2)
  })

  it('stops repeated decoding once the output stabilises', () => {
    const result = decodeUrl('hello%20world', 'component', true)
    expect(result.text).toBe('hello world')
    expect(result.passes).toBe(1)
  })

  it('caps repeated decoding and reports the cap was hit', () => {
    // A '%' re-encodes to '%25' every pass, so wrapping a space this many
    // times needs more than REPEAT_DECODE_CAP decodes to fully unwind.
    let input = ' '
    for (let i = 0; i < REPEAT_DECODE_CAP + 5; i++) input = encodeUrl(input, 'component')
    const result = decodeUrl(input, 'component', true)
    expect(result.ok).toBe(true)
    expect(result.hitCap).toBe(true)
    expect(result.passes).toBe(REPEAT_DECODE_CAP)
  })

  it('does not repeat when the flag is off, even for double-encoded input', () => {
    const doubleEncoded = encodeUrl(encodeUrl('a b', 'component'), 'component')
    const result = decodeUrl(doubleEncoded, 'component', false)
    expect(result.passes).toBe(1)
    expect(result.text).not.toBe('a b')
  })
})

describe('countChangedChars', () => {
  it('counts differing characters at the same position', () => {
    expect(countChangedChars('a=b', 'a%3Db')).toBe(4)
  })

  it('returns 0 for identical strings', () => {
    expect(countChangedChars('same', 'same')).toBe(0)
  })

  it('counts length difference for appended content', () => {
    expect(countChangedChars('ab', 'ab%20')).toBe(3)
  })
})
