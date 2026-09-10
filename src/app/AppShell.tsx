import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import styles from './AppShell.module.css'
import { Rail } from './Rail'
import { useDrawerFocus } from './useDrawerFocus'
import { Logo } from './Logo'
import { CommandPalette } from './CommandPalette'
import { ShortcutsDialog } from './ShortcutsDialog'
import { buildToolCommands, type Command } from './commands'
import { usePreferences } from './preferences'
import { Button } from '@/components/Button'
import { Kbd } from '@/components/Kbd'
import {
  IconKeyboard,
  IconMenu,
  IconMonitor,
  IconMoon,
  IconSearch,
  IconSun,
} from '@/components/Icon'
import { useHotkey } from '@/lib/useHotkey'
import { cx } from '@/lib/cx'

const THEME_ORDER = ['light', 'dark', 'system'] as const

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme, setTheme, clearRecents, resetEverything } = usePreferences()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const railRef = useRef<HTMLElement | null>(null)

  const closeRail = useCallback(() => setRailOpen(false), [])
  // Below 60rem the rail is a modal drawer, and has to behave like one.
  useDrawerFocus(railOpen, railRef, closeRail)
  const mainRef = useRef<HTMLElement | null>(null)
  const [routeAnnouncement, setRouteAnnouncement] = useState('')

  // A tool switch replaces the whole Outlet in place, so nothing else moves
  // keyboard focus or tells a screen reader the page changed — the same
  // React-Router SPA gap `docs/ARCHITECTURE.md` §4 calls out for share-link
  // hydration exists here for navigation. Moving focus to <main> resets tab
  // order to the top of the new tool instead of leaving it on a rail link
  // that may have scrolled away, and the live region announces the new title
  // for anyone not watching focus land. Skipped on the very first render —
  // stealing focus from the page a user arrived on would be its own bug.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
    // Runs after ToolPage's/HomePage's own title effect (children commit
    // before this parent), so `document.title` already reflects the route
    // that just mounted.
    setRouteAnnouncement(document.title)
  }, [location.pathname])

  const cycleTheme = useCallback(() => {
    const index = THEME_ORDER.indexOf(theme)
    const next = THEME_ORDER[(index + 1) % THEME_ORDER.length]!
    setTheme(next)
  }, [theme, setTheme])

  const commands = useMemo<Command[]>(() => {
    const tools = buildToolCommands((path) => void navigate(path))
    const actions: Command[] = [
      {
        id: 'action:theme',
        name: 'Cycle theme',
        description: 'Move between light, dark, and matching the system.',
        tag: 'View',
        section: 'Actions',
        keywords: 'dark light mode appearance theme colour scheme',
        run: cycleTheme,
      },
      {
        id: 'action:shortcuts',
        name: 'Keyboard shortcuts',
        description: 'Show every shortcut Dev Dock listens for.',
        tag: 'Help',
        section: 'Actions',
        keywords: 'keys hotkeys bindings help',
        run: () => setShortcutsOpen(true),
      },
      {
        id: 'action:home',
        name: 'Go to all tools',
        description: 'Return to the index of every tool.',
        tag: 'Navigate',
        section: 'Actions',
        keywords: 'home index overview start',
        run: () => void navigate('/'),
      },
      {
        id: 'action:clear-recents',
        name: 'Clear recent tools',
        description: 'Forget which tools were opened recently.',
        tag: 'Data',
        section: 'Actions',
        keywords: 'history recent forget privacy',
        run: clearRecents,
      },
      {
        id: 'action:reset',
        name: 'Clear all local data',
        description: 'Remove pins, recents, preferences, and reload.',
        tag: 'Data',
        section: 'Actions',
        keywords: 'reset wipe privacy storage delete localstorage',
        run: () => {
          if (window.confirm('Clear pins, recents, and preferences stored in this browser?')) {
            resetEverything()
          }
        },
      },
    ]
    return [...tools, ...actions]
  }, [navigate, cycleTheme, clearRecents, resetEverything])

  useHotkey(
    'mod+k',
    (e) => {
      e.preventDefault()
      setPaletteOpen(true)
    },
    { allowInInput: true },
  )

  useHotkey('slash', (e) => {
    e.preventDefault()
    setPaletteOpen(true)
  })

  useHotkey('shift+/', (e) => {
    e.preventDefault()
    setShortcutsOpen(true)
  })

  useHotkey(
    'mod+b',
    (e) => {
      e.preventDefault()
      setRailOpen((open) => !open)
    },
    { allowInInput: true },
  )

  useHotkey(
    'mod+shift+l',
    (e) => {
      e.preventDefault()
      cycleTheme()
    },
    { allowInInput: true },
  )

  const ThemeIcon = theme === 'light' ? IconSun : theme === 'dark' ? IconMoon : IconMonitor
  const themeLabel = `Theme: ${theme}. Activate to switch.`

  return (
    <div className={styles.frame}>
      <a className="skip-link" href="#main">
        Skip to tool
      </a>

      <Link to="/" className={styles.brand}>
        <Logo />
        <span className={styles.wordmark}>
          Dev<span className={styles.wordmarkDim}>Dock</span>
        </span>
      </Link>

      <header className={styles.header}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className={styles.railToggle}
          aria-label={railOpen ? 'Hide tool list' : 'Show tool list'}
          aria-expanded={railOpen}
          aria-controls="tool-rail"
          onClick={() => setRailOpen((open) => !open)}
        >
          <IconMenu size={16} />
        </Button>

        <button type="button" className={styles.searchTrigger} onClick={() => setPaletteOpen(true)}>
          <IconSearch size={14} />
          <span className={styles.searchLabel}>Search 22 tools…</span>
          <Kbd combo="mod+k" quiet />
        </button>

        <div className={styles.headerRight}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
          >
            <IconKeyboard size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            onClick={cycleTheme}
            aria-label={themeLabel}
            title={themeLabel}
          >
            <ThemeIcon size={16} />
          </Button>
        </div>
      </header>

      <Rail ref={railRef} id="tool-rail" open={railOpen} onNavigate={closeRail} />
      {railOpen && (
        <div className={styles.scrim} onClick={closeRail} role="presentation" aria-hidden="true" />
      )}

      <main className={cx(styles.main)} id="main" ref={mainRef} tabIndex={-1}>
        <Outlet />
      </main>
      <span role="status" aria-live="polite" className="visually-hidden">
        {routeAnnouncement}
      </span>

      {/* Mounted only while open, so its query and highlight reset for free
          instead of needing an effect to clear them. */}
      {paletteOpen && (
        <CommandPalette open onClose={() => setPaletteOpen(false)} commands={commands} />
      )}
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  )
}
