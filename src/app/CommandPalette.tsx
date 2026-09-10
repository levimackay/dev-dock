import { useEffect, useId, useMemo, useRef, useState } from 'react'
import styles from './CommandPalette.module.css'
import { Dialog } from '@/components/Dialog'
import { IconSearch } from '@/components/Icon'
import { Kbd } from '@/components/Kbd'
import { cx } from '@/lib/cx'
import { rankCommands, type Command, type RankedCommand } from './commands'

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

/**
 * The command palette, and with it the global search.
 *
 * Accessibility here is the interesting part. The visible focus never leaves
 * the text input — that is what makes type-then-arrow-then-Enter feel instant —
 * so the listbox relationship has to be declared rather than performed:
 *
 *   - the input carries `role="combobox"`, `aria-expanded`, `aria-controls`,
 *     and `aria-activedescendant` pointing at the highlighted row's id
 *   - the rows are `role="option"` with `aria-selected`, inside `role="listbox"`
 *   - the result count is announced through a live region on every query, so a
 *     screen-reader user knows the list changed under them
 *
 * That combination is what a native `<select>` gives for free and what most
 * hand-built palettes quietly omit.
 */
export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  const baseId = useId()

  const results = useMemo(() => rankCommands(commands, query), [commands, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('[data-active="true"]')
    row?.scrollIntoView({ block: 'nearest' })
  }, [active, results])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (results.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(results.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[active])
    }
  }

  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  let lastSection = ''

  return (
    <Dialog
      open={open}
      onClose={onClose}
      placement="top"
      bare
      ariaLabel="Command palette"
      className={styles.panel}
    >
      <div className={styles.searchRow}>
        <IconSearch size={15} className={styles.searchIcon} />
        <input
          data-autofocus
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tools and actions…"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results.length > 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search tools and actions"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {results.length === 0 ? (
        <p className={styles.empty}>
          Nothing matches “{query.trim()}”. Try a format name like <code>sha256</code>, or clear the
          search to browse everything.
        </p>
      ) : (
        <ul className={styles.results} id={listId} role="listbox" aria-label="Results" ref={listRef}>
          {results.map((result, index) => {
            const showSection = result.section !== lastSection
            lastSection = result.section
            return (
              <li key={result.id}>
                {showSection && (
                  <p className={styles.sectionLabel} role="presentation">
                    {result.section}
                  </p>
                )}
                <button
                  type="button"
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  tabIndex={-1}
                  className={cx(styles.row, index === active && styles.rowActive)}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(result)}
                >
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>
                      <Highlighted result={result} />
                    </span>
                    <span className={styles.rowDesc}>{result.description}</span>
                  </span>
                  <span className={styles.rowTag}>{result.tag}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className={styles.footer}>
        <span className={styles.hint}>
          <Kbd combo="up" quiet />
          <Kbd combo="down" quiet /> navigate
        </span>
        <span className={styles.hint}>
          <Kbd combo="enter" quiet /> open
        </span>
        <span className={styles.hint}>
          <Kbd combo="esc" quiet /> dismiss
        </span>
      </div>

      <span role="status" aria-live="polite" className="visually-hidden">
        {results.length} result{results.length === 1 ? '' : 's'}
      </span>
    </Dialog>
  )
}

/** Bolds the characters the query actually matched. */
function Highlighted({ result }: { result: RankedCommand }) {
  const { name, match } = result
  if (match.indices.length === 0) return <>{name}</>

  const hits = new Set(match.indices)
  const parts: React.ReactNode[] = []
  let buffer = ''
  let bufferHit = false

  const flush = (key: number) => {
    if (!buffer) return
    parts.push(
      bufferHit ? (
        <mark className={styles.rowHit} key={key}>
          {buffer}
        </mark>
      ) : (
        <span key={key}>{buffer}</span>
      ),
    )
    buffer = ''
  }

  for (let i = 0; i < name.length; i++) {
    const hit = hits.has(i)
    if (hit !== bufferHit) {
      flush(i)
      bufferHit = hit
    }
    buffer += name[i]
  }
  flush(name.length)

  return <>{parts}</>
}
