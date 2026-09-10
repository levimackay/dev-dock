import type { ReactNode } from 'react'
import styles from './Callout.module.css'
import { IconCheck, IconInfo, IconWarning } from './Icon'
import { cx } from '@/lib/cx'

export type CalloutTone = 'err' | 'warn' | 'info' | 'ok'

export interface CalloutProps {
  tone?: CalloutTone
  title?: ReactNode
  children?: ReactNode
  className?: string
  /**
   * Announces the message to assistive tech. Use for messages that appear in
   * response to something the user did (a parse failure), not for static help.
   */
  live?: boolean
}

const ICONS = {
  err: IconWarning,
  warn: IconWarning,
  info: IconInfo,
  ok: IconCheck,
} as const

export function Callout({ tone = 'info', title, children, className, live = false }: CalloutProps) {
  const Glyph = ICONS[tone]
  return (
    <div
      className={cx(styles.callout, styles[tone], className)}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
    >
      <Glyph size={14} className={styles.icon} />
      <div className={styles.content}>
        {title && <span className={styles.title}>{title}</span>}
        {children && <span className={styles.detail}>{children}</span>}
      </div>
    </div>
  )
}
