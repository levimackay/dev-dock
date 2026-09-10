/**
 * Base64 and Base64URL conversion between bytes and text.
 *
 * This lives in `src/lib` because four separate places need it and the two
 * fiddly parts are easy to get subtly wrong in each copy:
 *
 * 1. **The chunk loop.** `String.fromCharCode(...bytes)` is the obvious way to
 *    build the binary string `btoa` wants, and it throws
 *    `RangeError: Maximum call stack size exceeded` somewhere around 100k
 *    arguments depending on the engine. Chunking is not an optimisation; it is
 *    the difference between working and not working on a large file.
 *
 * 2. **The padding.** Base64URL conventionally drops `=`, so decoding has to
 *    put it back, and the amount depends on `length % 4`. A remainder of 1 is
 *    not a valid length at all, which callers generally want to report rather
 *    than paper over.
 */

/** Stays under the engine's argument-count limit for `Function.prototype.apply`. */
const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array, urlSafe = false): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  const encoded = btoa(binary)
  return urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded
}

/**
 * Restores the standard alphabet and any dropped padding.
 *
 * A length with remainder 1 is left alone rather than repaired: no valid Base64
 * string has that length, and silently padding it turns a detectable error into
 * wrong bytes. Callers that care check the length themselves first.
 */
export function normalizeBase64Url(text: string): string {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = standard.length % 4
  if (remainder === 2) return `${standard}==`
  if (remainder === 3) return `${standard}=`
  return standard
}

/** Decodes standard or URL-safe Base64. Throws on characters outside the alphabet. */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(normalizeBase64Url(text))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
