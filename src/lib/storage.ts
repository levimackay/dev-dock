/**
 * A namespaced, fail-soft wrapper around localStorage.
 *
 * Three problems this solves that raw `localStorage` does not:
 *
 *  1. **It can throw.** Safari in Private Browsing, and any browser with site
 *     data blocked, throws on `getItem`/`setItem` rather than returning null.
 *     A tool that crashes because someone has cookies disabled is a bad tool.
 *  2. **Anything can be in there.** The value may have been written by an older
 *     version of the app, or hand-edited in devtools. We therefore run every
 *     read through a caller-supplied validator and fall back to the default on
 *     failure, instead of trusting `JSON.parse` to hand back the right shape.
 *  3. **Key collisions.** Everything is prefixed so the app owns a clear
 *     namespace and `clearAll()` can never wipe an unrelated origin's data.
 *
 * Nothing sensitive is stored here by design, see SECURITY.md.
 */

const PREFIX = 'devdock:'

export type Validator<T> = (value: unknown) => value is T

function available(): boolean {
  try {
    const probe = `${PREFIX}__probe__`
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Cached because the probe touches disk and is called on every render path. */
let isAvailable: boolean | null = null

function ok(): boolean {
  isAvailable ??= available()
  return isAvailable
}

export function read<T>(key: string, fallback: T, isValid?: Validator<T>): T {
  if (!ok()) return fallback
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (isValid && !isValid(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

export function write(key: string, value: unknown): boolean {
  if (!ok()) return false
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    // Most likely QuotaExceededError. Dropping a preference is always
    // preferable to breaking the tool the user is in the middle of using.
    return false
  }
}

export function remove(key: string): void {
  if (!ok()) return
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/** Wipes only keys this app owns. Backs the "Clear local data" control. */
export function clearAll(): void {
  if (!ok()) return
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function storageAvailable(): boolean {
  return ok()
}

/** Test seam: forces the availability probe to re-run. */
export function __resetStorageProbe(): void {
  isAvailable = null
}

// ---- common validators -------------------------------------------------

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

export const isString = (v: unknown): v is string => typeof v === 'string'

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
