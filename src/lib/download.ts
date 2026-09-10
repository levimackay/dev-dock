/**
 * Triggers a client-side file download from an in-memory string.
 *
 * The MIME type is forced to a benign one and the filename is sanitised,
 * because both are attacker-influenced in tools where the content came from a
 * pasted document. A `text/html` blob download that the user then opens is a
 * same-origin XSS vector, so nothing here ever emits an active type.
 */
const SAFE_TYPES = new Set([
  'text/plain',
  'application/json',
  'text/csv',
  'text/markdown',
  'application/xml',
])

export function downloadText(filename: string, contents: string, mime = 'text/plain'): void {
  const type = SAFE_TYPES.has(mime) ? mime : 'text/plain'
  const safeName =
    filename
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
