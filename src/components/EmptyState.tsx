import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'
import { cx } from '@/lib/cx'

export interface EmptyStateProps {
  title: ReactNode
  /**
   * What to do next, in a sentence. An empty state that only says "No data"
   * has wasted the one moment where the user is definitely reading.
   */
  children?: ReactNode
  actions?: ReactNode
  mark?: ReactNode
  compact?: boolean
  className?: string
}

export function EmptyState({ title, children, actions, mark, compact, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, compact && styles.compact, className)}>
      {mark && <div className={styles.mark}>{mark}</div>}
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.body}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
