import { forwardRef } from 'react'
import { NavLink } from 'react-router-dom'
import styles from './AppShell.module.css'
import { CATEGORIES, TOOL_BY_ID, toolsInCategory } from '@/tools/registry'
import { usePreferences } from './preferences'
import { IconClock, IconStar } from '@/components/Icon'
import { cx } from '@/lib/cx'
import type { ToolDefinition } from '@/tools/types'

interface RailProps {
  open: boolean
  onNavigate: () => void
  id: string
}

/**
 * The persistent tool list.
 *
 * Ordering is deliberate: pinned first, then recent, then the full catalogue by
 * category. A tool the user has chosen outranks one the app guessed at, and
 * both outrank the alphabet.
 */
export const Rail = forwardRef<HTMLElement, RailProps>(function Rail(
  { open, onNavigate, id },
  ref,
) {
  const { pinned, recents } = usePreferences()

  const pinnedTools = pinned.map((toolId) => TOOL_BY_ID.get(toolId)).filter(isTool)
  const recentTools = recents
    .filter((toolId) => !pinned.includes(toolId))
    .map((toolId) => TOOL_BY_ID.get(toolId))
    .filter(isTool)
    .slice(0, 5)

  return (
    <nav id={id} ref={ref} className={cx(styles.rail, open && styles.railOpen)} aria-label="Tools">
      {pinnedTools.length > 0 && (
        <Group title="Pinned" icon={<IconStar size={11} filled />} count={pinnedTools.length}>
          {pinnedTools.map((tool) => (
            <RailItem key={tool.id} tool={tool} onNavigate={onNavigate} />
          ))}
        </Group>
      )}

      {recentTools.length > 0 && (
        <Group title="Recent" icon={<IconClock size={11} />} count={recentTools.length}>
          {recentTools.map((tool) => (
            <RailItem key={tool.id} tool={tool} onNavigate={onNavigate} />
          ))}
        </Group>
      )}

      {CATEGORIES.map((category) => {
        const tools = toolsInCategory(category.id)
        return (
          <Group key={category.id} title={category.label} count={tools.length}>
            {tools.map((tool) => (
              <RailItem key={tool.id} tool={tool} onNavigate={onNavigate} />
            ))}
          </Group>
        )
      })}
    </nav>
  )
})

function isTool(tool: ToolDefinition | undefined): tool is ToolDefinition {
  return Boolean(tool)
}

function Group({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon?: React.ReactNode
  count: number
  children: React.ReactNode
}) {
  return (
    <div className={styles.group}>
      <h2 className={styles.groupHead}>
        {icon}
        {title}
        <span className={styles.groupCount}>{count}</span>
      </h2>
      <ul className={styles.list}>{children}</ul>
    </div>
  )
}

function RailItem({ tool, onNavigate }: { tool: ToolDefinition; onNavigate: () => void }) {
  const { isPinned, togglePin } = usePreferences()
  const pinnedNow = isPinned(tool.id)

  // The pin control is a sibling of the link, not a child of it. Nesting an
  // interactive element inside an anchor is invalid HTML and produces a control
  // that assistive tech cannot reliably reach or describe.
  return (
    <li className={styles.itemRow}>
      <NavLink
        to={`/t/${tool.id}`}
        className={({ isActive }) => cx(styles.item, isActive && styles.active)}
        onClick={onNavigate}
        title={tool.short}
      >
        <span className={styles.itemLabel}>{tool.name}</span>
      </NavLink>
      <button
        type="button"
        aria-label={pinnedNow ? `Unpin ${tool.name}` : `Pin ${tool.name}`}
        aria-pressed={pinnedNow}
        className={cx(styles.pinBtn, pinnedNow && styles.pinned)}
        onClick={() => togglePin(tool.id)}
      >
        <IconStar size={12} filled={pinnedNow} />
      </button>
    </li>
  )
}
