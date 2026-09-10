import { useEffect, type RefObject } from 'react'

// Broad on purpose, then filtered: see the note on the same constant in
// Dialog.tsx for why the "not tabbable" test cannot live in the selector.
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]'

function isTabbable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false
  if (el.tabIndex < 0) return false
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return true
}

/**
 * Makes the mobile tool rail behave like the modal it looks like.
 *
 * Below 60rem the rail slides in over the page behind a scrim. That reads as a
 * dialog to a sighted user, and it needs to behave as one for a keyboard user
 * too: focus moves in on open, Tab cannot escape it, Escape closes it, and
 * focus returns to whatever opened it. Without this, tabbing past the last tool
 * walks invisibly into the page underneath, which is the classic "where did my
 * focus go" bug.
 *
 * It deliberately does *not* reuse `Dialog`. Above 60rem the same element is a
 * permanent sidebar and must not trap anything, so the behaviour is conditional
 * on the layout rather than on the component. The media query is read live so
 * that rotating a tablet mid-session gets the right behaviour.
 */
export function useDrawerFocus(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  query = '(max-width: 60rem)',
): void {
  useEffect(() => {
    if (!open) return
    if (!globalThis.matchMedia?.(query).matches) return

    const drawer = ref.current
    if (!drawer) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    ;[...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].find(isTabbable)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const items = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isTabbable)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      // The active element can be outside the drawer entirely if focus was
      // never moved in; pull it back rather than letting Tab walk the page.
      if (!drawer.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previouslyFocused?.focus?.()
    }
  }, [open, ref, onClose, query])
}
