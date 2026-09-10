import type { ReactNode } from 'react'
import styles from './StatGrid.module.css'
import { cx } from '@/lib/cx'
import { CopyButton } from './CopyButton'

export interface Stat {
  label: string
  value: ReactNode
  note?: ReactNode
  wide?: boolean
  accent?: boolean
  /** When set, renders a copy button for this cell's underlying plain-text value. */
  copy?: string
}

/**
 * A grid of labelled readouts.
 *
 * Deliberately not "four big numbers with small captions on a landing page":
 * the values are mono, tabular, and the same size as body copy, because these
 * are measurements to be read, not achievements to be admired.
 */
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <dl className={cx(styles.grid, className)}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cx(styles.cell, stat.wide && styles.wide, stat.accent && styles.accent)}
        >
          <dt className={styles.label}>{stat.label}</dt>
          <dd className={styles.value}>
            <span className={styles.valueText}>{stat.value}</span>
            {stat.copy !== undefined && (
              <CopyButton
                value={stat.copy}
                size="sm"
                variant="ghost"
                iconOnly
                label={`Copy ${stat.label}`}
                className={styles.copyBtn}
              />
            )}
          </dd>
          {stat.note && <dd className={styles.note}>{stat.note}</dd>}
        </div>
      ))}
    </dl>
  )
}
