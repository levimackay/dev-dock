import type { ReactNode } from 'react'
import styles from './TwoPane.module.css'
import { SplitPane } from '@/components/SplitPane'
import { cx } from '@/lib/cx'

/** The options bar that sits under the toolbar in most tools. */
export function OptionsBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.options, className)}>{children}</div>
}

/** A labelled cluster inside the options bar. */
export function OptionGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={styles.optionGroup}>
      {label && <span className={styles.optionLabel}>{label}</span>}
      {children}
    </div>
  )
}

export function OptionSpacer() {
  return <div className={styles.grow} />
}

/** Input on the left, output on the right, with a draggable divider. */
export function TwoPane({
  input,
  output,
  storageKey,
  labelFirst = 'input',
  labelSecond = 'output',
}: {
  input: ReactNode
  output: ReactNode
  storageKey: string
  labelFirst?: string
  labelSecond?: string
}) {
  return (
    <div className={styles.panes}>
      <SplitPane
        storageKey={storageKey}
        labelFirst={labelFirst}
        labelSecond={labelSecond}
        first={<div className={styles.paneInner}>{input}</div>}
        second={<div className={styles.paneInner}>{output}</div>}
      />
    </div>
  )
}

/** A vertical stack of panels, for tools that are not input/output shaped. */
export function PaneStack({ children }: { children: ReactNode }) {
  return <div className={styles.stack}>{children}</div>
}

export { styles as twoPaneStyles }
