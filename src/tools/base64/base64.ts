/**
 * Base64 encoding and decoding.
 *
 * `btoa`/`atob` are the platform's Base64 primitives, but they operate on
 * *binary strings*: one character per byte, code points 0-255. Handing them a
 * string containing any non-Latin-1 character throws `InvalidCharacterError`,
 * which is why naive implementations break the first time someone pastes an
 * emoji or a Cyrillic name.
 *
 * The correct pipeline is therefore:
 *
 *     text --TextEncoder--> UTF-8 bytes --> binary string --btoa--> base64
 *
 * and the exact inverse on the way back. Everything below is built on that.
 */

import { base64ToBytes, bytesToBase64 } from '@/lib/base64'

export { bytesToBase64 }

export type Base64Variant = 'standard' | 'urlsafe'

export interface EncodeOptions {
  variant: Base64Variant
  /** Insert a newline every 76 characters, as MIME (RFC 2045) requires. */
  lineBreaks: boolean
  /** Emit `=` padding. Off is common for JWT-style URL-safe payloads. */
  padding: boolean
}

export interface DecodeResult {
  ok: boolean
  text: string
  error?: string
  /** True when the bytes decoded fine but are not valid UTF-8 text. */
  binary?: boolean
}

const MIME_WIDTH = 76

export function encodeBase64(text: string, options: EncodeOptions): string {
  if (text === '') return ''
  let output = bytesToBase64(new TextEncoder().encode(text))

  if (options.variant === 'urlsafe') {
    output = output.replace(/\+/g, '-').replace(/\//g, '_')
  }
  if (!options.padding) {
    output = output.replace(/=+$/, '')
  }
  if (options.lineBreaks) {
    output = output.replace(new RegExp(`.{1,${MIME_WIDTH}}`, 'g'), '$&\n').trimEnd()
  }
  return output
}

/**
 * Normalises the many shapes real-world Base64 arrives in: URL-safe alphabets,
 * missing padding, embedded whitespace from a wrapped email header, and a
 * `data:` URI prefix pasted straight out of devtools.
 */
export function normalizeBase64(input: string): string {
  let value = input.trim()

  const dataUri = /^data:[^;,]*(;[^;,]*)*;base64,/i.exec(value)
  if (dataUri) value = value.slice(dataUri[0].length)

  value = value.replace(/\s+/g, '')
  value = value.replace(/-/g, '+').replace(/_/g, '/')

  const remainder = value.length % 4
  if (remainder === 2) value += '=='
  else if (remainder === 3) value += '='
  return value
}

const BASE64_CHARS = /^[A-Za-z0-9+/]*={0,2}$/

export function decodeBase64(input: string): DecodeResult {
  if (input.trim() === '') return { ok: true, text: '' }

  const normalized = normalizeBase64(input)

  if (normalized.length % 4 === 1) {
    return {
      ok: false,
      text: '',
      error:
        'Truncated input: a Base64 string is never 1 character past a multiple of 4. Check for a missing character at the end.',
    }
  }

  if (!BASE64_CHARS.test(normalized)) {
    const bad = /[^A-Za-z0-9+/=]/.exec(normalized)
    const char = bad?.[0] ?? '?'
    return {
      ok: false,
      text: '',
      error: `Not valid Base64: “${char}” at position ${(bad?.index ?? 0) + 1} is outside the alphabet.`,
    }
  }

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(normalized)
  } catch {
    return { ok: false, text: '', error: 'Not valid Base64: the encoder rejected this input.' }
  }

  // `fatal: true` makes the decoder throw on malformed UTF-8 rather than
  // silently littering the output with U+FFFD. Binary payloads (a PNG, a
  // protobuf) are a legitimate answer, not an error, so they get labelled.
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    return {
      ok: true,
      binary: true,
      text: toHexDump(bytes),
    }
  }
}

/** Renders bytes as a classic offset / hex / ASCII dump. */
export function toHexDump(bytes: Uint8Array, maxBytes = 4096): string {
  const shown = bytes.subarray(0, maxBytes)
  const lines: string[] = []

  for (let offset = 0; offset < shown.length; offset += 16) {
    const row = shown.subarray(offset, offset + 16)
    const hex = [...row].map((b) => b.toString(16).padStart(2, '0')).join(' ')
    const ascii = [...row]
      .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
      .join('')
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  |${ascii}|`)
  }

  if (bytes.length > maxBytes) {
    lines.push(`… ${(bytes.length - maxBytes).toLocaleString()} more bytes not shown`)
  }
  return lines.join('\n')
}

/** Cheap heuristic used to pre-select a direction when input is pasted. */
export function looksLikeBase64(input: string): boolean {
  const value = input.trim()
  if (value.length < 8 || value.length % 4 === 1) return false
  return /^[A-Za-z0-9+/\-_\s]+={0,2}$/.test(value) && !/\s{2}/.test(value)
}
