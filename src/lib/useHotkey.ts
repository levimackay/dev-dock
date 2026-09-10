import { useEffect, useRef } from 'react'
import { registerHotkey } from './hotkeys'

/**
 * Binds a global hotkey for the life of the component.
 *
 * The handler is held in a ref so that an inline arrow function at the call
 * site does not tear down and re-register the binding on every render — a
 * subtle source of dropped keystrokes if the parent re-renders mid-press.
 */
export function useHotkey(
  combo: string | null,
  handler: (event: KeyboardEvent) => void,
  options: { allowInInput?: boolean; enabled?: boolean } = {},
): void {
  const ref = useRef(handler)
  ref.current = handler

  const { allowInInput = false, enabled = true } = options

  useEffect(() => {
    if (!combo || !enabled) return
    return registerHotkey(combo, (e) => ref.current(e), { allowInInput })
  }, [combo, enabled, allowInInput])
}
