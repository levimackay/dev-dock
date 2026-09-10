import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  clearShareFragment,
  decodeShareState,
  encodeShareState,
  readShareFragment,
} from './share'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

describe('share encoding', () => {
  it('round-trips a plain object', async () => {
    const state = { input: 'hello', direction: 'encode', padding: true }
    const encoded = await encodeShareState(state)
    expect(await decodeShareState(encoded, isRecord)).toEqual(state)
  })

  it('round-trips multi-byte text', async () => {
    const state = { input: 'Ђорђе, 🇷🇸 日本語' }
    const encoded = await encodeShareState(state)
    expect(await decodeShareState(encoded, isRecord)).toEqual(state)
  })

  it('produces a URL-safe payload with no padding', async () => {
    const encoded = await encodeShareState({ input: '?'.repeat(120) })
    expect(encoded).toMatch(/^[dp][A-Za-z0-9_-]*$/)
  })

  it('compresses repetitive input well below its base64 size', async () => {
    const state = { input: '{"key":"value"},'.repeat(200) }
    const encoded = await encodeShareState(state)
    const rawBase64Length = Math.ceil(JSON.stringify(state).length / 3) * 4
    expect(encoded.length).toBeLessThan(rawBase64Length / 2)
  })

  it('returns null for a truncated payload instead of throwing', async () => {
    const encoded = await encodeShareState({ input: 'hello world' })
    expect(await decodeShareState(encoded.slice(0, 6), isRecord)).toBeNull()
  })

  it('returns null for an unknown version prefix', async () => {
    expect(await decodeShareState('xABCDEF', isRecord)).toBeNull()
  })

  it('returns null for an empty payload', async () => {
    expect(await decodeShareState('', isRecord)).toBeNull()
  })

  it('returns null when the payload fails validation', async () => {
    const encoded = await encodeShareState(['not', 'an', 'object'])
    expect(await decodeShareState(encoded, isRecord)).toBeNull()
  })

  it('returns null for outright garbage', async () => {
    expect(await decodeShareState('d!!!!not base64!!!!', isRecord)).toBeNull()
  })

  it('handles a payload large enough to exercise the chunked base64 path', async () => {
    const state = { input: Array.from({ length: 60000 }, (_, i) => String(i % 10)).join('') }
    const encoded = await encodeShareState(state)
    expect(await decodeShareState(encoded, isRecord)).toEqual(state)
  })
})

describe('share URLs', () => {
  it('puts the payload in the fragment, never the query string', () => {
    const url = buildShareUrl('/t/base64', 'dABC')
    expect(url).toContain('#s=dABC')
    expect(new URL(url).search).toBe('')
  })

  it('reads the payload back out of a fragment', () => {
    expect(readShareFragment('#s=dABC')).toBe('dABC')
  })

  it('reads a payload that is not the first fragment parameter', () => {
    expect(readShareFragment('#other=1&s=dABC')).toBe('dABC')
  })

  it('returns null when there is no payload', () => {
    expect(readShareFragment('#something-else')).toBeNull()
    expect(readShareFragment('')).toBeNull()
  })

  it('clearing a fragment is a no-op when there is none', () => {
    expect(() => clearShareFragment()).not.toThrow()
  })
})

describe('inbound payload limits', () => {
  it('refuses an absurdly long fragment without trying to decode it', async () => {
    const isRecordCheck = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null
    expect(await decodeShareState('d' + 'A'.repeat(300_000), isRecordCheck)).toBeNull()
  })

  it('refuses a payload that inflates past the ceiling', async () => {
    // A megabyte of one repeated character deflates to a few hundred bytes and
    // inflates back to a megabyte: the shape of a decompression bomb, at a size
    // that is safe to run in a test.
    const bomb = await encodeShareState({ input: 'A'.repeat(8 * 1024 * 1024) })
    const isRecordCheck = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null
    expect(await decodeShareState(bomb, isRecordCheck)).toBeNull()
  })

  it('still accepts a payload comfortably under the ceiling', async () => {
    const isRecordCheck = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null
    const encoded = await encodeShareState({ input: 'x'.repeat(100_000) })
    expect(await decodeShareState(encoded, isRecordCheck)).not.toBeNull()
  })
})
