/**
 * Shareable tool state, encoded into the URL **fragment**.
 *
 * Two decisions worth understanding:
 *
 * 1. **Fragment, not query string.** Everything after `#` is stripped by the
 *    browser before the request leaves the machine. It never appears in server
 *    access logs, proxy logs, CDN logs, or the `Referer` header sent to third
 *    parties. Since the payload is whatever the user pasted into a tool, which
 *    could be a JWT or a config file, the query string would leak it to any
 *    host the page is served from. The fragment does not.
 *
 * 2. **deflate-raw via the native CompressionStream API.** Tool payloads are
 *    text, often highly repetitive (JSON, SQL, logs), and base64 inflates bytes
 *    by 33%. Deflating first typically nets a 40-70% shorter link on real input
 *    and costs zero bundle bytes, because every browser we target ships
 *    CompressionStream. Where it is missing we fall back to plain base64url so
 *    the feature degrades instead of disappearing; the one-byte version prefix
 *    tells the decoder which path produced the string.
 *
 * The encoding is deliberately *not* encryption. A share link is readable by
 * anyone who has it, and the UI says so.
 */

import { base64ToBytes, bytesToBase64 } from './base64'

const V_DEFLATE = 'd'
const V_PLAIN = 'p'

/** Browsers cap URLs well above this, but ~8k is where proxies start to fail. */
export const MAX_SHARE_CHARS = 8000

/**
 * Ceiling on what a share fragment may inflate to.
 *
 * The outbound cap above is a courtesy to proxies. This one is a defence. A
 * link is attacker-supplied by definition, deflate reaches roughly 1000:1 on
 * repetitive input, and a 200 KB fragment (well within what a browser or a chat
 * app will carry) inflates to about 200 MB before `JSON.parse` is even reached.
 * On a phone that is an out-of-memory tab kill from a link the user only
 * clicked. Four megabytes is far beyond any real tool state and cheap to hold.
 */
const MAX_INFLATED_BYTES = 4 * 1024 * 1024

/** No legitimate link is close to this; anything longer is not worth decoding. */
const MAX_ENCODED_CHARS = 256 * 1024

/**
 * Pushes bytes through a (de)compression stream using the raw writer/reader
 * API.
 *
 * The shorter `new Response(blob.stream().pipeThrough(cs)).arrayBuffer()` form
 * reads better but couples three separate stream implementations, Blob,
 * fetch's Response, and the compression stream, which do not reliably share a
 * realm outside a browser. Driving the streams directly has no such dependency.
 */
async function pipe(
  // `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: the stream writer
  // takes a BufferSource, which excludes views backed by a SharedArrayBuffer.
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const writer = stream.writable.getWriter()
  // Not awaited: the writer only settles once the reader below drains it, so
  // awaiting here would deadlock. The rejection is swallowed rather than
  // ignored, because cancelling the reader (the size ceiling below) rejects
  // this promise, and an unhandled rejection from a defence that worked is
  // still an unhandled rejection.
  void writer
    .write(bytes)
    .then(() => writer.close())
    .catch(() => undefined)

  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = value as Uint8Array
    chunks.push(chunk)
    total += chunk.length
    if (total > MAX_INFLATED_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new RangeError('Share payload inflates past the size limit.')
    }
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const hasCompression = () =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

export async function encodeShareState(state: unknown): Promise<string> {
  const json = JSON.stringify(state)
  const bytes = new TextEncoder().encode(json)
  if (!hasCompression()) return V_PLAIN + bytesToBase64(bytes, true)
  try {
    const deflated = await pipe(bytes, new CompressionStream('deflate-raw'))
    return V_DEFLATE + bytesToBase64(deflated, true)
  } catch {
    return V_PLAIN + bytesToBase64(bytes, true)
  }
}

export async function decodeShareState<T>(
  encoded: string,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  if (!encoded) return null
  // Checked before any decoding work, not after: the point is to refuse the
  // input, not to find out how big it was.
  if (encoded.length > MAX_ENCODED_CHARS) return null
  const version = encoded[0]
  const body = encoded.slice(1)
  try {
    let bytes = base64ToBytes(body)
    if (version === V_DEFLATE) {
      if (!hasCompression()) return null
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    } else if (version !== V_PLAIN) {
      return null
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return isValid(parsed) ? parsed : null
  } catch {
    // Truncated, hand-edited, or from a future version. A share link is
    // untrusted input like any other: never let it throw into the render path.
    return null
  }
}

/** Builds the absolute URL a user can copy. */
export function buildShareUrl(pathname: string, encoded: string): string {
  const { origin } = window.location
  return `${origin}${pathname}#s=${encoded}`
}

/** Reads the `s=` payload out of the current fragment, if any. */
export function readShareFragment(hash: string = window.location.hash): string | null {
  const match = /(?:^#|&)s=([^&]+)/.exec(hash)
  return match?.[1] ?? null
}

/** Removes the share payload from the address bar without a navigation. */
export function clearShareFragment(): void {
  if (!readShareFragment()) return
  history.replaceState(null, '', window.location.pathname + window.location.search)
}
