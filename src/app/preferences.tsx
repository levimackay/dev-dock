import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useLocalStorage } from '@/lib/useLocalStorage'
import { isStringArray, clearAll } from '@/lib/storage'
import { TOOL_BY_ID } from '@/tools/registry'

export type ThemeChoice = 'light' | 'dark' | 'system'

const MAX_RECENTS = 8

const isTheme = (v: unknown): v is ThemeChoice => v === 'light' || v === 'dark' || v === 'system'

interface Preferences {
  theme: ThemeChoice
  setTheme: (theme: ThemeChoice) => void
  /** Effective theme after resolving `system`. */
  resolvedTheme: 'light' | 'dark'

  pinned: string[]
  isPinned: (toolId: string) => boolean
  togglePin: (toolId: string) => void

  recents: string[]
  noteVisit: (toolId: string) => void
  clearRecents: () => void

  resetEverything: () => void
}

const PreferencesContext = createContext<Preferences | null>(null)

/**
 * The OS colour-scheme preference, as an external store.
 *
 * `useSyncExternalStore` is the right primitive here rather than
 * `useState` + `useEffect`: it reads the current value during render instead of
 * one paint later, so the first frame is never the wrong theme.
 */
const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const mql = globalThis.matchMedia?.(DARK_QUERY)
  if (!mql) return () => undefined
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function readSystemTheme(): 'light' | 'dark' {
  return globalThis.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

function useSystemTheme(): 'light' | 'dark' {
  return useSyncExternalStore(subscribeToSystemTheme, readSystemTheme, () => 'light')
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<ThemeChoice>('theme', 'system', isTheme)
  const [pinned, setPinned] = useLocalStorage<string[]>('pinned', [], isStringArray)
  const [recents, setRecents] = useLocalStorage<string[]>('recents', [], isStringArray)
  const system = useSystemTheme()

  const resolvedTheme = theme === 'system' ? system : theme

  // The attribute drives every token in tokens.css.
  //
  // It is always written as a concrete `light` or `dark`, never removed for
  // `system`. Leaving it off and letting a `prefers-color-scheme` media query
  // pick up the slack means maintaining two copies of the dark palette, and
  // they drift. Resolving the preference here keeps tokens.css stating each
  // palette once; `index.html` does the same before first paint.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  const togglePin = useCallback(
    (toolId: string) => {
      setPinned((prev) =>
        prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [...prev, toolId],
      )
    },
    [setPinned],
  )

  const noteVisit = useCallback(
    (toolId: string) => {
      setRecents((prev) => [toolId, ...prev.filter((id) => id !== toolId)].slice(0, MAX_RECENTS))
    },
    [setRecents],
  )

  const clearRecents = useCallback(() => setRecents([]), [setRecents])

  const resetEverything = useCallback(() => {
    clearAll()
    window.location.reload()
  }, [])

  const value = useMemo<Preferences>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      // Tool ids are filtered on read rather than on write, so a tool that is
      // renamed or removed cannot leave a dead entry in the rail forever.
      pinned: pinned.filter((id) => TOOL_BY_ID.has(id)),
      isPinned: (id: string) => pinned.includes(id),
      togglePin,
      recents: recents.filter((id) => TOOL_BY_ID.has(id)),
      noteVisit,
      clearRecents,
      resetEverything,
    }),
    [
      theme,
      setTheme,
      resolvedTheme,
      pinned,
      togglePin,
      recents,
      noteVisit,
      clearRecents,
      resetEverything,
    ],
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): Preferences {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside <PreferencesProvider>')
  return context
}
