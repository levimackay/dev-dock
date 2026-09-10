/**
 * Triggers a client-side file download from an in-memory string.
 *
 * The MIME type is forced to a benign one and the filename is sanitised,
 * because in a tool whose content came from a pasted document both are
 * attacker-influenced.
 *
 * The threat is not same-origin XSS: a file opened from disk loads over
 * `file://` with an opaque origin and cannot touch this app's storage or
 * cookies. It is simpler than that. An HTML file the user saved from a tool
 * they trust and then double-clicks opens as a live page with a plausible
 * filename, and can phish for credentials or read other local files. Emitting
 * only inert types makes that unreachable.
 */
/*
 * Inert types only. `application/xml` was on this list and has been removed:
 * an `<?xml-stylesheet?>` processing instruction runs XSLT, which browsers
 * honour for locally opened files, so XML is the one entry that is arguably
 * active. No caller used it.
 */
const SAFE_TYPES = new Set(['text/plain', 'application/json', 'text/csv', 'text/markdown'])

export function downloadText(filename: string, contents: string, mime = 'text/plain'): void {
  const type = SAFE_TYPES.has(mime) ? mime : 'text/plain'
  const safeName =
    filename
      // Control characters are exactly what we are trying to strip here, so the
      // no-control-regex warning is the rule misreading the intent.
      // eslint-disable-next-line no-control-regex
      .replace(/[/\\?%*:|"<>\x00-\x1f]/g, '-')
      .replace(/^\.+/, '')
      .slice(0, 120) || 'dev-dock-export.txt'

  const blob = new Blob([contents], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = safeName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke on the next task so Firefox has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
