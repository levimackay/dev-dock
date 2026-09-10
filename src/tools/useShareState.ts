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

/**
 * How a single field of shared state is checked.
 *
 * A kind name covers the common case. A predicate covers everything else, and
 * the reason it exists is worth stating: for a while this only accepted kind
 * names, so a union-typed field was validated as "a string" and a bounded
 * number as "a number". An inbound link could then carry
 * `nanoidLength: 100000` into `crypto.getRandomValues`, or an arbitrary word
 * into `fetch(url, { method })`. A validator that cannot express the
 * constraint is not a validator; it is a type annotation that ran at runtime.
 */
export type FieldSpec = 'string' | 'boolean' | 'number' | 'string[]' | ((value: unknown) => boolean)

/** Accepts a member of a fixed set. The common shape for a union-typed field. */
export const oneOf =
  (...allowed: readonly string[]) =>
  (value: unknown): boolean =>
    typeof value === 'string' && allowed.includes(value)

/** Accepts a finite number inside an inclusive range. */
export const numberBetween =
  (min: number, max: number) =>
  (value: unknown): boolean =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

/** Accepts an array of strings no longer than `max`, each no longer than `maxLength`. */
export const stringArrayOf =
  (max: number, maxLength = 256) =>
  (value: unknown): boolean =>
    Array.isArray(value) &&
    value.length <= max &&
    value.every((item) => typeof item === 'string' && item.length <= maxLength)

/**
 * Builds a validator for a flat object of shared tool state.
 *
 * A field the payload omits is skipped, because partial payloads merge over the
 * tool's defaults. A field the payload includes must satisfy its spec or the
 * whole payload is rejected: a link is either the state it claims to be or it
 * is not worth guessing at.
 */
export function shapeValidator<T extends object>(shape: {
  [K in keyof T]: FieldSpec
}): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    // Iterating keys rather than entries: `Object.entries` on a mapped type
    // widens the value to `Function`, which is not callable without a cast.
    for (const key of Object.keys(shape)) {
      if (!(key in record)) continue
      const spec: FieldSpec = shape[key as keyof T]
      const actual = record[key]
      if (typeof spec === 'function') {
        if (!spec(actual)) return false
      } else if (spec === 'string[]') {
        if (!Array.isArray(actual) || !actual.every((v) => typeof v === 'string')) return false
      } else if (typeof actual !== spec) {
        return false
      }
    }
    return true
  }
}
