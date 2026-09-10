/**
 * Clipboard write with a fallback for non-secure contexts.
 *
 * `navigator.clipboard` requires a secure context (https or localhost). Someone
 * running the built app off a file:// URL or a plain-http LAN address still
 * deserves a working copy button, hence the execCommand path — deprecated, but
 * the only thing that works there, and it costs eight lines.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.cssText = 'position:fixed;top:-1000px;opacity:0'
    document.body.appendChild(el)
    el.select()
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const okay = document.execCommand('copy')
    document.body.removeChild(el)
    return okay
  } catch {
    return false
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText || !window.isSecureContext) return null
    return await navigator.clipboard.readText()
  } catch {
    // Permission denied, or the user dismissed the prompt. Not an error.
    return null
  }
}
