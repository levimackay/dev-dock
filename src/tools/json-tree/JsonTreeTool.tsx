import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { TextInput } from '@/components/Field'
import { IconChevronRight, IconLayers, IconSearch, IconTrash } from '@/components/Icon'
import { OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { useToast } from '@/components/Toast'
import { cx } from '@/lib/cx'
import { copyText } from '@/lib/clipboard'
import { describeJsonError } from '@/tools/json-formatter/json'
import {
  childEntries,
  containerPaths,
  extendPath,
  isContainer,
  parentPath,
  queryPath,
  searchTree,
  type JsonValue,
} from './tree'
import styles from './JsonTreeTool.module.css'

interface State {
  input: string
}

const DEFAULTS: State = { input: '' }
const isState = shapeValidator<State>({ input: 'string' })

const DEFAULT_EXPAND_DEPTH = 2
// A container this deep down the line stops rendering its own children past
// this count until "show all" is clicked for it specifically.
const MAX_CHILDREN_PER_CONTAINER = 200
// Hard ceiling across the whole tree, regardless of how many containers ask
// for more — this is what keeps a 50 MB document from locking up the tab.
const MAX_TOTAL_ROWS = 5000

const SAMPLE = `{
  "org": "Acme Freight",
  "active": true,
  "fleet": [
    { "id": "T-104", "driver": "J. Alvarez", "status": "en-route", "cargoKg": 8200 },
    { "id": "T-207", "driver": "M. Okafor", "status": "idle", "cargoKg": 0 },
    { "id": "T-311", "driver": "S. Novak", "status": "en-route", "cargoKg": 5400 }
  ],
  "depot": {
    "city": "Reno",
    "coords": { "lat": 39.53, "lng": -119.81 },
    "manager": null
  },
  "lastSync": "2026-09-08T14:02:11Z"
}`

interface FilterOutcome {
  kind: 'path' | 'search'
  matches: Array<{ path: string; value: JsonValue }>
  truncated: boolean
}

export default function JsonTreeTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const toast = useToast()

  const parsed = useMemo((): { ok: true; value: JsonValue } | { ok: false; error: string } => {
    try {
      // JSON.parse is typed `any`; funnel it through `unknown` so the assertion
      // to JsonValue is the one visible, deliberate step.
      const value: unknown = JSON.parse(state.input)
      return { ok: true, value: value as JsonValue }
    } catch (error) {
      return { ok: false, error: describeJsonError(state.input, error) }
    }
  }, [state.input])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['$']))
  const [fullyShown, setFullyShown] = useState<Set<string>>(() => new Set())
  const [focusedPath, setFocusedPath] = useState('$')
  const [pendingFocus, setPendingFocus] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState('')

  const refs = useRef(new Map<string, HTMLDivElement>())
  const treeRef = useRef<HTMLDivElement | null>(null)

  // A freshly parsed document gets a fresh view: default depth, nothing
  // force-expanded, focus back at the root.
  //
  // This is React's "adjust state when a value changes" pattern, done during
  // render rather than in an effect. An effect would paint the previous
  // document's expansion set for one frame before correcting it, and would
  // cascade a second render every time the user types a character.
  const [lastParsed, setLastParsed] = useState(parsed)
  if (lastParsed !== parsed) {
    setLastParsed(parsed)
    if (parsed.ok) {
      setExpanded(containerPaths(parsed.value, DEFAULT_EXPAND_DEPTH))
      setFullyShown(new Set())
      setFocusedPath('$')
    }
  }

  // Moving focus to a row that required expanding an ancestor first (a
  // search-result jump) has to wait for that expansion to actually land in
  // the DOM — a plain synchronous .focus() at click time would miss it. Once
  // React commits the newly expanded rows, this effect finds the element and
  // focuses it. Direct arrow-key navigation never touches this path because
  // its target row already exists, so it focuses synchronously instead.
  useEffect(() => {
    if (!pendingFocus) return
    const el = refs.current.get(pendingFocus)
    if (el) {
      el.focus()
      el.scrollIntoView({ block: 'nearest' })
      setFocusedPath(pendingFocus)
    }
    // Clearing the one-shot request after it has been honoured. It is a
    // post-commit acknowledgement, not derived state — the DOM node this waits
    // for does not exist until React has painted the expanded ancestors.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingFocus(undefined)
  }, [pendingFocus])

  // A `useCallback` rather than a plain function so its identity is stable and
  // so the ref map is only touched when React invokes the callback after
  // commit — never while rendering.
  const registerRef = useCallback((path: string, el: HTMLDivElement | null) => {
    if (el) refs.current.set(path, el)
    else refs.current.delete(path)
  }, [])

  const focus = (path: string) => {
    setFocusedPath(path)
    refs.current.get(path)?.focus()
  }

  const move = (from: string, delta: number) => {
    const root = treeRef.current
    if (!root) return
    const all = Array.from(root.querySelectorAll<HTMLDivElement>('[role="treeitem"]'))
    const current = refs.current.get(from)
    const index = current ? all.indexOf(current) : -1
    const next = all[index + delta]
    const nextPath = next?.dataset.path
    if (nextPath) focus(nextPath)
  }

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const showAll = (path: string) => {
    setFullyShown((prev) => new Set(prev).add(path))
  }

  const jumpTo = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      let ancestor = parentPath(path)
      while (ancestor) {
        next.add(ancestor)
        ancestor = parentPath(ancestor)
      }
      return next
    })
    setPendingFocus(path)
  }

  const filterResult: FilterOutcome | undefined = useMemo(() => {
    if (!parsed.ok || filter.trim() === '') return undefined
    const byPath = queryPath(parsed.value, filter)
    if (byPath.ok) return { kind: 'path', matches: byPath.matches, truncated: false }
    const bySearch = searchTree(parsed.value, filter)
    return { kind: 'search', matches: bySearch.matches, truncated: bySearch.truncated }
  }, [parsed, filter])

  const ctx: TreeCtx = {
    expanded,
    fullyShown,
    focusedPath,
    focus,
    move,
    toggle,
    showAll,
    registerRef,
    toast,
  }

  const budget = { remaining: MAX_TOTAL_ROWS, exceeded: false }
  // `ctx` carries `registerRef`, which closes over the ref map. The rule sees a
  // ref-touching function reachable from a call made during render and assumes
  // the ref is read now; in fact React only invokes it after commit, when the
  // row's DOM node exists. Rendering the tree eagerly (rather than through a
  // child component) is what makes the shared row budget work.
  // eslint-disable-next-line react-hooks/refs
  const treeBody = parsed.ok ? renderNode(parsed.value, '$', undefined, 1, ctx, budget) : null

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => patch({ input: SAMPLE })}>
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(parsed.ok ? containerPaths(parsed.value) : new Set(['$']))}
            disabled={!parsed.ok}
          >
            Expand all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(new Set())}
            disabled={!parsed.ok}
          >
            Collapse all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: '' })}
            disabled={!state.input}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
          Default view opens {DEFAULT_EXPAND_DEPTH} levels deep. Containers over{' '}
          {MAX_CHILDREN_PER_CONTAINER} children truncate until you ask to see the rest.
        </span>
        <OptionSpacer />
      </OptionsBar>

      <TwoPane
        storageKey="json-tree"
        input={
          <Panel label="JSON">
            <CodeArea
              label="JSON to explore"
              value={state.input}
              onValueChange={(input) => patch({ input })}
              lineNumbers
              acceptDrop
              placeholder="Paste JSON here, or drop a .json file."
            />
          </Panel>
        }
        output={
          <Panel
            label="Tree"
            tone={!parsed.ok && state.input ? 'err' : 'default'}
            bodyClassName={styles.pane}
          >
            {state.input && (
              <div className={styles.filterRow}>
                <TextInput
                  mono
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter: data.items[0].name, items[*].id, or plain text"
                  aria-label="Filter the tree by path or text"
                  disabled={!parsed.ok}
                />
              </div>
            )}

            {filterResult && <FilterResults result={filterResult} onJump={jumpTo} />}

            {!state.input ? (
              <EmptyState compact title="Nothing to explore yet" mark={<IconLayers size={24} />}>
                Paste JSON on the left, drop a .json file onto it, or load the sample.
              </EmptyState>
            ) : !parsed.ok ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <Callout tone="err" title="Cannot parse this JSON" live>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>
                    {parsed.error}
                  </pre>
                </Callout>
              </div>
            ) : (
              <>
                <div ref={treeRef} role="tree" aria-label="JSON tree" className={styles.tree}>
                  {treeBody}
                </div>
                {budget.exceeded && (
                  <div style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
                    <Callout tone="warn" title="Row limit reached">
                      Stopped rendering at {MAX_TOTAL_ROWS.toLocaleString()} rows. Filter to a
                      smaller branch to see the rest.
                    </Callout>
                  </div>
                )}
              </>
            )}
          </Panel>
        }
      />
    </ToolShell>
  )
}

/* --------------------------------------------------------------- tree row */

interface TreeCtx {
  expanded: Set<string>
  fullyShown: Set<string>
  focusedPath: string
  focus: (path: string) => void
  move: (from: string, delta: number) => void
  toggle: (path: string) => void
  showAll: (path: string) => void
  registerRef: (path: string, el: HTMLDivElement | null) => void
  toast: { show: (message: string, tone?: 'ok' | 'err' | 'info') => void }
}

interface Budget {
  remaining: number
  exceeded: boolean
}

/**
 * A plain recursive function rather than a nested component. `renderNode`
 * calls itself directly and returns JSX built entirely from host elements
 * (`div`, `button`) — none of that is a custom component, so React never
 * defers any of this work. That means the shared `budget` counter can be
 * mutated in place as the recursion proceeds and read back once the whole
 * call finishes, with no risk of React interleaving another component's
 * render in between and observing a half-updated count.
 */
function renderNode(
  value: JsonValue,
  path: string,
  keyLabel: string | undefined,
  level: number,
  ctx: TreeCtx,
  budget: Budget,
): ReactNode {
  if (budget.remaining <= 0) {
    budget.exceeded = true
    return null
  }
  budget.remaining--

  const container = isContainer(value)
  const entries = container ? childEntries(value) : []
  const hasChildren = entries.length > 0
  const isExpanded = hasChildren && ctx.expanded.has(path)
  const isRoot = path === '$'

  const shownEntries = ctx.fullyShown.has(path)
    ? entries
    : entries.slice(0, MAX_CHILDREN_PER_CONTAINER)
  const hiddenCount = entries.length - shownEntries.length

  return (
    <div
      key={path}
      role="treeitem"
      aria-level={level}
      // A single-select tree still has to say which item is current; without
      // aria-selected a screen reader announces every row identically.
      aria-selected={path === ctx.focusedPath}
      aria-expanded={hasChildren ? isExpanded : undefined}
      tabIndex={path === ctx.focusedPath ? 0 : -1}
      data-path={path}
      ref={(el) => ctx.registerRef(path, el)}
      className={styles.item}
      onClick={(e) => {
        e.stopPropagation()
        ctx.focus(path)
      }}
      onKeyDown={(e) => handleRowKeyDown(e, path, value, isExpanded, ctx)}
    >
      <div className={styles.row}>
        {hasChildren ? (
          <button
            type="button"
            className={styles.expander}
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation()
              ctx.toggle(path)
              ctx.focus(path)
            }}
          >
            <IconChevronRight
              size={11}
              className={cx(styles.chevron, isExpanded && styles.chevronOpen)}
            />
          </button>
        ) : (
          <span className={styles.expanderSpacer} aria-hidden="true" />
        )}

        {!isRoot && <span className={styles.key}>{keyLabel}</span>}
        {!isRoot && <span className={styles.punct}>:</span>}

        {container ? (
          <span className={styles.badge}>
            {Array.isArray(value) ? 'Array' : 'Object'} · {pluralizeChildren(entries.length, value)}
          </span>
        ) : (
          <span className={cx(styles.value, valueClassName(value))}>{formatScalar(value)}</span>
        )}

        <span className={styles.actions}>
          <CopyButton value={path} size="sm" variant="ghost" iconOnly label="Copy path" />
          <CopyButton
            value={() => (container ? JSON.stringify(value, null, 2) : formatScalar(value))}
            size="sm"
            variant="ghost"
            iconOnly
            label="Copy value"
          />
        </span>
      </div>

      {hasChildren && isExpanded && (
        <div role="group" className={styles.group}>
          {shownEntries.map(({ key, value: child }) =>
            renderNode(
              child,
              extendPath(path, key, Array.isArray(value)),
              key,
              level + 1,
              ctx,
              budget,
            ),
          )}
          {hiddenCount > 0 && (
            <div className={styles.more}>
              <Button size="sm" variant="ghost" onClick={() => ctx.showAll(path)}>
                Show {hiddenCount} more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function handleRowKeyDown(
  e: ReactKeyboardEvent<HTMLDivElement>,
  path: string,
  value: JsonValue,
  isExpanded: boolean,
  ctx: TreeCtx,
): void {
  const container = isContainer(value)
  const entries = container ? childEntries(value) : []
  const hasChildren = entries.length > 0

  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (hasChildren && !isExpanded) {
      ctx.toggle(path)
    } else if (hasChildren && isExpanded) {
      const first = entries[0]
      if (first) ctx.focus(extendPath(path, first.key, Array.isArray(value)))
    }
    return
  }

  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (hasChildren && isExpanded) {
      ctx.toggle(path)
    } else {
      const parent = parentPath(path)
      if (parent) ctx.focus(parent)
    }
    return
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    ctx.move(path, 1)
    return
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault()
    ctx.move(path, -1)
    return
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    void copyText(path).then((ok) =>
      ctx.toast.show(ok ? `Copied ${path}` : 'Copy failed', ok ? 'ok' : 'err'),
    )
  }
}

function formatScalar(value: JsonValue): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  // Only scalars reach here, but the JsonValue union still admits containers,
  // and `String({})` would silently render "[object Object]".
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

// CSS Module lookups are typed `string | undefined` because the generated type
// is an index signature and `noUncheckedIndexedAccess` is on. Falling back to
// the empty string keeps the helper's contract honest without weakening the flag
// for the whole project.
function valueClassName(value: JsonValue): string {
  if (value === null) return styles.valNull ?? ''
  if (typeof value === 'string') return styles.valString ?? ''
  if (typeof value === 'number') return styles.valNumber ?? ''
  if (typeof value === 'boolean') return styles.valBool ?? ''
  return ''
}

function pluralizeChildren(count: number, value: JsonValue): string {
  const noun = Array.isArray(value) ? 'item' : 'key'
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/* ---------------------------------------------------------------- filter */

function FilterResults({
  result,
  onJump,
}: {
  result: FilterOutcome
  onJump: (path: string) => void
}) {
  const SHOWN = 100
  const shown = result.matches.slice(0, SHOWN)

  return (
    <div className={styles.results}>
      {shown.length === 0 ? (
        <div
          style={{
            padding: 'var(--sp-2) var(--sp-3)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--fg-subtle)',
          }}
        >
          <IconSearch size={11} /> No match.
        </div>
      ) : (
        shown.map((match) => (
          <button
            key={match.path}
            type="button"
            className={styles.resultRow}
            onClick={() => onJump(match.path)}
          >
            <span className={styles.resultPath}>{match.path}</span>
            <span className={styles.resultValue}>
              {isContainer(match.value) ? previewContainer(match.value) : formatScalar(match.value)}
            </span>
          </button>
        ))
      )}
      {result.matches.length > SHOWN && (
        <div
          style={{
            padding: 'var(--sp-1) var(--sp-3)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--fg-subtle)',
          }}
        >
          +{result.matches.length - SHOWN} more not shown
        </div>
      )}
      {result.truncated && (
        <div
          style={{
            padding: 'var(--sp-1) var(--sp-3)',
            fontSize: 'var(--text-2xs)',
            color: 'var(--fg-subtle)',
          }}
        >
          Search stopped after 500 matches.
        </div>
      )}
    </div>
  )
}

function previewContainer(value: JsonValue[] | { [key: string]: JsonValue }): string {
  return Array.isArray(value) ? `[${value.length} items]` : `{${Object.keys(value).length} keys}`
}
