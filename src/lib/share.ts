/**
 * Shareable tool state, encoded into the URL **fragment**.
 *
 * Two decisions worth understanding:
 *
 * 1. **Fragment, not query string.** Everything after `#` is stripped by the
 *    browser before the request leaves the machine. It never appears in server
 *    access logs, proxy logs, CDN logs, or the `Referer` header sent to third
 *    parties. Since the payload is whatever the user pasted into a tool — which
 *    could be a JWT or a config file — the query string would leak it to any
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

const V_DEFLATE = 'd'
const V_PLAIN = 'p'

/** Browsers cap URLs well above this, but ~8k is where proxies start to fail. */
export const MAX_SHARE_CHARS = 8000

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  // Chunked to stay under the argument-count limit on large payloads.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Pushes bytes through a (de)compression stream using the raw writer/reader
 * API.
 *
 * The shorter `new Response(blob.stream().pipeThrough(cs)).arrayBuffer()` form
 * reads better but couples three separate stream implementations — Blob,
 * fetch's Response, and the compression stream — which do not reliably share a
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
  // awaiting here would deadlock.
  void writer.write(bytes).then(() => writer.close())

  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = value as Uint8Array
    chunks.push(chunk)
    total += chunk.length
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
  if (!hasCompression()) return V_PLAIN + toBase64Url(bytes)
  try {
    const deflated = await pipe(bytes, new CompressionStream('deflate-raw'))
    return V_DEFLATE + toBase64Url(deflated)
  } catch {
    return V_PLAIN + toBase64Url(bytes)
  }
}

export async function decodeShareState<T>(
  encoded: string,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  if (!encoded) return null
  const version = encoded[0]
  const body = encoded.slice(1)
  try {
    let bytes = fromBase64Url(body)
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
