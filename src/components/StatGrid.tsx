import type { ReactNode } from 'react'
import styles from './StatGrid.module.css'
import { cx } from '@/lib/cx'

export interface Stat {
  label: string
  value: ReactNode
  note?: ReactNode
  wide?: boolean
  accent?: boolean
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
          <dd className={styles.value}>{stat.value}</dd>
          {stat.note && <dd className={styles.note}>{stat.note}</dd>}
        </div>
      ))}
    </dl>
  )
}
