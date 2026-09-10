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

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return true
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

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
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
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
      // Visibility is checked with `checkVisibility()` where the browser has it,
      // and with an attribute check otherwise. An earlier version used
      // `offsetParent !== null`, which is wrong here: `offsetParent` is null for
      // every descendant of a `position: fixed` element — which the dialog is —
      // so it silently reduced the focusable set to one element and broke the
      // wrap in both directions.
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible)
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
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
