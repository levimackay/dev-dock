/* eslint-disable jsx-a11y/no-noninteractive-element-interactions,
                  jsx-a11y/no-noninteractive-tabindex -- ARIA's `separator` has
   two flavours: a decorative rule, and a focusable window splitter (the one
   carrying aria-valuenow), which is explicitly interactive and keyboard
   operable. The plugin only models the decorative one, so it flags a correct
   implementation of the APG splitter pattern. */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './SplitPane.module.css'
import { cx } from '@/lib/cx'
import { read, write } from '@/lib/storage'

export interface SplitPaneProps {
  first: ReactNode
  second: ReactNode
  direction?: 'horizontal' | 'vertical'
  /** Starting split as a fraction 0-1 given to the first pane. */
  defaultRatio?: number
  min?: number
  max?: number
  /** When set, the ratio is remembered under this key. */
  storageKey?: string
  /** Collapses to a stack below 52rem. On for editor splits, off for sidebars. */
  responsive?: boolean
  labelFirst?: string
  labelSecond?: string
  className?: string
}

/**
 * A two-pane split with a draggable divider.
 *
 * Two things here are worth more than they look:
 *
 * - **Pointer Events, not mouse events.** `setPointerCapture` keeps the drag
 *   attached to the handle even when the pointer outruns it or leaves the
 *   window, and the same code path handles touch and pen. The mouse-event
 *   version of this needs document-level listeners and still drops drags.
 *
 * - **The divider is focusable and has `role="separator"`.** Arrow keys nudge
 *   it by 2%, Home/End slam it to the limits. A resize you cannot perform from
 *   the keyboard is a resize half the users do not have.
 */
export function SplitPane({
  first,
  second,
  direction = 'horizontal',
  defaultRatio = 0.5,
  min = 0.18,
  max = 0.82,
  storageKey,
  responsive = true,
  labelFirst = 'first panel',
  labelSecond = 'second panel',
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(() =>
    storageKey
      ? clamp(read(`split:${storageKey}`, defaultRatio, isFiniteNumber), min, max)
      : defaultRatio,
  )
  const [dragging, setDragging] = useState(false)
  const id = useId()

  const commit = useCallback(
    (next: number) => {
      const clamped = clamp(next, min, max)
      setRatio(clamped)
      if (storageKey) write(`split:${storageKey}`, clamped)
    },
    [max, min, storageKey],
  )

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const next =
        direction === 'horizontal'
          ? (event.clientX - rect.left) / rect.width
          : (event.clientY - rect.top) / rect.height
      commit(next)
    },
    [commit, direction],
  )

  useEffect(() => {
    if (!dragging) return
    const stop = () => setDragging(false)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    // Suppress text selection for the duration of the drag.
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.userSelect = ''
    }
  }, [dragging, onPointerMove])

  const percent = Math.round(ratio * 100)

  return (
    <div
      ref={containerRef}
      className={cx(styles.split, styles[direction], responsive && styles.responsive, className)}
      style={{ '--a': `${percent}%`, '--b': `${100 - percent}%` } as React.CSSProperties}
    >
      <div className={styles.pane} id={`${id}-a`}>
        {first}
      </div>
      {/* `separator` has two flavours in ARIA: a decorative rule, and a focusable
          window splitter, the one carrying aria-valuenow, which is explicitly
          interactive. The rule only models the first. */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-label={`Resize ${labelFirst} and ${labelSecond}`}
        aria-valuenow={percent}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-controls={`${id}-a`}
        className={cx(styles.handle, dragging && styles.dragging)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onDoubleClick={() => commit(defaultRatio)}
        onKeyDown={(e) => {
          const back = direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'
          const fwd = direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
          if (e.key === back) commit(ratio - 0.02)
          else if (e.key === fwd) commit(ratio + 0.02)
          else if (e.key === 'Home') commit(min)
          else if (e.key === 'End') commit(max)
          else if (e.key === 'Enter') commit(defaultRatio)
          else return
          e.preventDefault()
        }}
      />
      <div className={styles.pane} id={`${id}-b`}>
        {second}
      </div>
    </div>
  )
}

/** Storage holds whatever an older version, or devtools, put there. */
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
