import { createContext, useContext, useMemo, type ReactNode } from 'react'
import styles from './ToolShell.module.css'
import { IconGlobe } from './Icon'
import { cx } from '@/lib/cx'
import type { ToolMeta } from '@/tools/types'

/**
 * The frame every tool renders inside.
 *
 * The identity half of the toolbar (name, tagline, pin, share) is owned by the
 * route, not by the tool, and reaches this component through context. The tool
 * only contributes its own `actions` and its body. That split is what makes the
 * header pixel-identical across 22 independently written tools, a tool
 * *cannot* accidentally render its title differently, because it never renders
 * its title at all.
 */

export interface ToolChrome {
  meta: ToolMeta
  pin: ReactNode
  share: ReactNode
}

const ChromeContext = createContext<ToolChrome | null>(null)

export function ToolChromeProvider({
  value,
  children,
}: {
  value: ToolChrome
  children: ReactNode
}) {
  const memo = useMemo(() => value, [value])
  return <ChromeContext.Provider value={memo}>{children}</ChromeContext.Provider>
}

export interface ToolShellProps {
  /** Tool-specific controls, right-aligned in the toolbar. */
  actions?: ReactNode
  /** Wraps the body in a scrolling, padded region. Off for edge-to-edge editors. */
  padded?: boolean
  children: ReactNode
}

export function ToolShell({ actions, padded = false, children }: ToolShellProps) {
  const chrome = useContext(ChromeContext)

  // Rendered outside a route only in isolated component tests.
  const meta = chrome?.meta

  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        <div className={styles.identity}>
          <h1 className={styles.title}>{meta?.name ?? 'Tool'}</h1>
          {meta?.short && <p className={styles.tagline}>{meta.short}</p>}
        </div>
        {meta?.network && (
          <span className={styles.badge} title="This tool can make outbound network requests.">
            <IconGlobe size={11} />
            network
          </span>
        )}
        <div className={styles.spacer} />
        {actions && <div className={styles.actions}>{actions}</div>}
        {actions && chrome && <div className={styles.divider} aria-hidden="true" />}
        {chrome && (
          <div className={styles.actions}>
            {chrome.share}
            {chrome.pin}
          </div>
        )}
      </div>
      <div className={cx(styles.body, padded && styles.padded)}>{children}</div>
    </div>
  )
}
