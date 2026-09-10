import type { ReactNode } from 'react'
import styles from './Panel.module.css'
import { cx } from '@/lib/cx'

export interface PanelProps {
  /** Mono uppercase region label. Kept short: this is chrome, not a heading. */
  label?: ReactNode
  /** Right-aligned readout, e.g. "1,204 chars · 8 KB". */
  status?: ReactNode
  /** Buttons in the panel header. */
  actions?: ReactNode
  footer?: ReactNode
  /** Applies the standard content inset. Off for editors, which bleed. */
  padded?: boolean
  /** Drops the border and background — for a panel inside another frame. */
  flush?: boolean
  tone?: 'default' | 'err'
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/**
 * The single container primitive in the app.
 *
 * Every tool region — input, output, options, results — is a Panel. That is
 * what keeps 22 independently written tools looking like one product: nobody
 * gets to invent their own box.
 */
export function Panel({
  label,
  status,
  actions,
  footer,
  padded = false,
  flush = false,
  tone = 'default',
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const hasHead = Boolean(label || status || actions)
  return (
    <section
      className={cx(styles.panel, flush && styles.flush, tone === 'err' && styles['tone-err'], className)}
    >
      {hasHead && (
        <header className={styles.head}>
          {label && <span className={styles.label}>{label}</span>}
          {status && <span className={styles.status}>{status}</span>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      <div className={cx(styles.body, padded && styles.padded, bodyClassName)}>{children}</div>
      {footer && <footer className={styles.foot}>{footer}</footer>}
    </section>
  )
}
