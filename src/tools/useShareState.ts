import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

/**
 * Shared-link plumbing for tools.
 *
 * A tool declares one state object and gets three things at once: React state,
 * hydration from an inbound `#s=` link, and registration as the source the
 * toolbar's Share button reads from. No tool writes URL-encoding code.
 *
 * The route decodes the fragment *before* mounting the tool, so by the time a
 * tool calls this hook the payload is either present or definitively absent.
 * That removes the awkward middle state where a tool renders with defaults and
 * then has to be retro-patched a tick later, clobbering anything typed in
 * between.
 *
 * Inbound payloads are untrusted: the validator is mandatory, not optional.
 */

export interface ShareBridge {
  /** Decoded payload from the URL fragment, already JSON-parsed. */
  inbound: unknown
  /** Lets a tool register the state the Share button should encode. */
  register: (getState: () => unknown) => void
}

export const ShareContext = createContext<ShareBridge | null>(null)

export function useShareState<T extends object>(
  defaults: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const bridge = useContext(ShareContext)
  const inbound = bridge?.inbound

  const [state, setState] = useState<T>(() =>
    isValid(inbound) ? { ...defaults, ...inbound } : defaults,
  )

  // Held in a ref so the getter handed to the toolbar never goes stale without
  // forcing the toolbar to re-render on every keystroke in the tool.
  //
  // The ref is written in an effect rather than during render. Writing it in
  // the render body works today but is a concurrent-rendering hazard: React may
  // render a component and then throw the result away, and a ref mutated on
  // that discarded pass would leak state the user never sees.
  const latest = useRef(state)
  useEffect(() => {
    latest.current = state
  }, [state])

  const register = bridge?.register
  useEffect(() => {
    register?.(() => latest.current)
  }, [register])

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setState((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])

  return [state, update]
}

/** Builds a validator for a flat object of strings, booleans, and numbers. */
export function shapeValidator<T extends object>(shape: {
  [K in keyof T]: 'string' | 'boolean' | 'number' | 'string[]'
}): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    for (const [key, kind] of Object.entries(shape)) {
      if (!(key in record)) continue // partial payloads merge over defaults
      const actual = record[key]
      if (kind === 'string[]') {
        if (!Array.isArray(actual) || !actual.every((v) => typeof v === 'string')) return false
      } else if (typeof actual !== kind) {
        return false
      }
    }
    return true
  }
}
