import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Dialog.module.css'
import { Button } from './Button'
import { IconX } from './Icon'
import { cx } from '@/lib/cx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Palette-style dialogs sit high; confirmations sit centred. */
  placement?: 'top' | 'center'
  width?: string
  /** Hides the header entirely — for the command palette, which is its own UI. */
  bare?: boolean
  labelledBy?: string
  ariaLabel?: string
  className?: string
  children: ReactNode
}

/**
 * Candidate focusable elements.
 *
 * Deliberately broad, then filtered in `isTabbable` below. An earlier version
 * tried to express "not tabbable" in the selector itself as
 * `button:not([disabled]), …, [tabindex]:not([tabindex="-1"])`, which reads
 * correctly and is wrong: the clauses are an OR, so `button` matched every
 * button *including* the ones carrying `tabindex="-1"`. The command palette's
 * option rows are exactly that, so the trap computed a last element the browser
 * would never focus, never recognised the end of the list, and let Tab walk
 * straight out of the dialog.
 */
const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]'

function isTabbable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false
  if (el.tabIndex < 0) return false
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return true
}

/**
 * A modal dialog with a real focus trap.
 *
 * `<dialog showModal>` would give the trap for free, but it also gives a
 * top-layer backdrop we cannot theme consistently and inconsistent behaviour
 * for the "focus the search input on open" case that the command palette needs.
 * So the trap is implemented here, and it is implemented properly:
 *
 *   - focus moves into the dialog on open, and back to the invoking element on
 *     close (`previouslyFocused`), which is the part most hand-rolled traps miss
 *   - Tab and Shift+Tab wrap at the ends of the focusable set
 *   - Escape closes
 *   - the rest of the app is marked `aria-hidden` via `inert` on the app root,
 *     so a screen reader cannot wander out of the dialog
 *   - background scroll is locked
 */
export function Dialog({
  open,
  onClose,
  title,
  placement = 'center',
  width,
  bare = false,
  labelledBy,
  ariaLabel,
  className,
  children,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return

    previouslyFocused.current = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    // Focus the first sensible target inside the dialog.
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find(isTabbable) ??
        panel
      target.focus()
    }, 0)

    return () => {
      window.clearTimeout(timer)
      root?.removeAttribute('inert')
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      // Visibility is checked with `checkVisibility()` where the browser has
      // it. An earlier version used `offsetParent !== null`, which is wrong
      // here: `offsetParent` is null for every descendant of a
      // `position: fixed` element, which the dialog is.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isTabbable)
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Capture phase so the dialog wins over any tool-level Escape binding.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the backdrop is a click-outside convenience with no role and no tab stop; Escape is the keyboard equivalent and is handled above
    <div
      className={cx(styles.backdrop, styles[placement])}
      // The backdrop is a click-outside convenience, not a control: it has no
      // role, is not in the tab order, and duplicates nothing. Escape is the
      // keyboard equivalent and is handled above, so there is no keyboard user
      // left without a way to dismiss the dialog.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (title ? titleId : undefined)}
        aria-label={ariaLabel}
        className={cx(styles.panel, className)}
        style={width ? ({ '--dialog-w': width } as React.CSSProperties) : undefined}
      >
        {!bare && (
          <header className={styles.head}>
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Close dialog"
              onClick={onClose}
              className={styles.close}
            >
              <IconX size={14} />
            </Button>
          </header>
        )}
        {/* The body scrolls when the content overflows, so it takes a tab stop:
            a scroll container that no keyboard user can reach is content they
            cannot read. WCAG 2.1.1, and axe's scrollable-region-focusable. */}
        <div className={styles.body} tabIndex={0}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
