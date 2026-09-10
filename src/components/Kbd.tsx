import styles from './Kbd.module.css'
import { formatCombo } from '@/lib/hotkeys'
import { cx } from '@/lib/cx'

export interface KbdProps {
  /** A combo like `mod+k` or `shift+?`. Rendered per platform. */
  combo: string
  quiet?: boolean
  className?: string
}

export function Kbd({ combo, quiet, className }: KbdProps) {
  const keys = formatCombo(combo)
  return (
    <kbd className={cx(styles.kbd, quiet && styles.quiet, className)}>
      {keys.map((key, i) => (
        <span className={styles.key} key={`${key}-${i}`}>
          {key}
        </span>
      ))}
    </kbd>
  )
}
