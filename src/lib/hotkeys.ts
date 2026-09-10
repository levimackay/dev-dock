/**
 * A tiny global hotkey layer.
 *
 * Design notes:
 *
 * - **One listener, not N.** Every registered binding lives in a module-level
 *   map keyed by its normalised combo, and a single capture-phase `keydown`
 *   listener dispatches to it. Adding a hundred bindings costs one listener.
 *
 * - **`event.code`, not `event.key`, for letters.** `key` is layout-dependent:
 *   on a Dvorak or AZERTY keyboard `Cmd+K` produces a different `key` than the
 *   physical K. `code` reports the physical key, which is what shortcut muscle
 *   memory is actually attached to. Digits and punctuation still use `key`
 *   because `code` for those is unhelpfully positional.
 *
 * - **Typing wins.** Any binding without a modifier is suppressed while focus
 *   is in a text field, so a bare `?` help shortcut cannot eat a question mark
 *   the user is typing into a regex.
 *
 * - **`mod` means Cmd on Apple, Ctrl elsewhere.** Written once here rather
 *   than at every call site.
 */

export type HotkeyHandler = (event: KeyboardEvent) => void

interface Binding {
  handler: HotkeyHandler
  /** Fire even when focus is inside an input/textarea/contenteditable. */
  allowInInput: boolean
}

const bindings = new Map<string, Set<Binding>>()
let listening = false

export const isApple = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** Canonical form: sorted modifiers, then the key, all lower case. */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)

  const mods = new Set<string>()
  let key = ''
  for (const part of parts) {
    if (part === 'mod') mods.add(isApple() ? 'meta' : 'ctrl')
    else if (part === 'cmd' || part === 'meta') mods.add('meta')
    else if (part === 'ctrl' || part === 'control') mods.add('ctrl')
    else if (part === 'shift') mods.add('shift')
    else if (part === 'alt' || part === 'option') mods.add('alt')
    else key = part
  }
  return [...['ctrl', 'meta', 'alt', 'shift'].filter((m) => mods.has(m)), key].join('+')
}

function comboFromEvent(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('ctrl')
  if (e.metaKey) mods.push('meta')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')

  // Physical-key name for letters; logical key for everything else.
  let key = e.key.toLowerCase()
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase()
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5)
  else if (key === ' ') key = 'space'
  else if (key === 'escape') key = 'esc'
  else if (key === 'arrowup') key = 'up'
  else if (key === 'arrowdown') key = 'down'
  else if (key === 'arrowleft') key = 'left'
  else if (key === 'arrowright') key = 'right'

  return [...mods, key].join('+')
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(type)
  }
  return false
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented) return
  const combo = comboFromEvent(e)
  const matched = bindings.get(combo)
  if (!matched?.size) return

  const inEditable = isEditableTarget(e.target)
  const bare = !e.ctrlKey && !e.metaKey && !e.altKey

  for (const binding of matched) {
    if (inEditable && bare && !binding.allowInInput) continue
    binding.handler(e)
    if (e.defaultPrevented) return
  }
}

export function registerHotkey(
  combo: string,
  handler: HotkeyHandler,
  options: { allowInInput?: boolean } = {},
): () => void {
  const key = normalizeCombo(combo)
  const binding: Binding = { handler, allowInInput: options.allowInInput ?? false }

  let set = bindings.get(key)
  if (!set) {
    set = new Set()
    bindings.set(key, set)
  }
  set.add(binding)

  if (!listening) {
    window.addEventListener('keydown', onKeyDown, { capture: true })
    listening = true
  }

  return () => {
    set.delete(binding)
    if (set.size === 0) bindings.delete(key)
  }
}

/** Renders a combo the way this platform writes it: `⌘K` vs `Ctrl+K`. */
export function formatCombo(combo: string): string[] {
  const apple = isApple()
  return combo
    .toLowerCase()
    .split('+')
    .map((raw) => {
      const part = raw.trim()
      if (part === 'mod') return apple ? '⌘' : 'Ctrl'
      if (part === 'meta' || part === 'cmd') return apple ? '⌘' : 'Win'
      if (part === 'ctrl') return apple ? '⌃' : 'Ctrl'
      if (part === 'alt') return apple ? '⌥' : 'Alt'
      if (part === 'shift') return apple ? '⇧' : 'Shift'
      if (part === 'esc') return 'Esc'
      if (part === 'enter') return apple ? '↵' : 'Enter'
      if (part === 'space') return 'Space'
      if (part === 'up') return '↑'
      if (part === 'down') return '↓'
      if (part === 'left') return '←'
      if (part === 'right') return '→'
      if (part === 'slash') return '/'
      return part.length === 1 ? part.toUpperCase() : part
    })
    .filter(Boolean)
}

/** Test seam. */
export function __clearHotkeys(): void {
  bindings.clear()
}
