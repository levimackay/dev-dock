import { useEffect, useMemo, useState, type ReactNode } from 'react'
import styles from './DiffView.module.css'
import { cx } from '@/lib/cx'
import { diffWords, type DiffLine, type LineDiffResult, type WordSpan } from '@/lib/diff'
import { IconChevronRight } from '@/components/Icon'
import { pluralize } from '@/lib/format'

/**
 * The rendering engine shared by Text Diff and Code Diff.
 *
 * The interesting problem here is not the diff itself (`src/lib/diff.ts`
 * already solved that) — it is turning a *flat* list of equal/delete/insert
 * lines into rows that read as a diff. Two things make that non-trivial:
 *
 * 1. **Pairing.** A line that was edited shows up as one `delete` line and
 *    one `insert` line next to each other, not as a single "changed" line —
 *    the line-level algorithm has no concept of "this became that". Side by
 *    side, a human expects the old and new version of the *same* line on one
 *    row, with only the words that actually changed highlighted. So a run of
 *    consecutive non-equal lines is split into its deletes and inserts and
 *    zipped index-for-index; each zipped pair gets a word-level diff
 *    (`diffWords`) run on it. A run with an unequal number of deletes and
 *    inserts (pure additions or removals) leaves the extra lines unpaired.
 *
 * 2. **Collapsing.** A long run of unchanged lines is either shown in full,
 *    truncated to `context` lines at each end with a static "N lines hidden"
 *    separator (the traditional `diff -u` behaviour, used by Text Diff), or
 *    collapsed entirely behind a clickable toggle (used by Code Diff — the
 *    thing that actually differentiates its reading experience from Text
 *    Diff's).
 *
 * Both tools consume the same `buildBlocks` output; they only differ in the
 * `mode` and `collapse` props they pass in.
 */

export interface ChangeBlock {
  kind: 'change'
  /** Lines in their original relative order — preserved for unified mode. */
  lines: DiffLine[]
  /** Word-level highlight spans for lines that were paired with a counterpart. */
  wordsByLine: Map<DiffLine, WordSpan[]>
  /** Deletes zipped with inserts index-for-index, for side-by-side mode. */
  pairs: Array<{ left?: DiffLine; right?: DiffLine }>
}

export interface EqualBlock {
  kind: 'equal'
  lines: DiffLine[]
}

export type Block = EqualBlock | ChangeBlock

export function buildBlocks(lines: DiffLine[]): Block[] {
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line) {
      i++
      continue
    }

    if (line.op === 'equal') {
      const run: DiffLine[] = []
      while (i < lines.length && lines[i]?.op === 'equal') {
        run.push(lines[i]!)
        i++
      }
      blocks.push({ kind: 'equal', lines: run })
      continue
    }

    const run: DiffLine[] = []
    while (i < lines.length && lines[i] && lines[i]!.op !== 'equal') {
      run.push(lines[i]!)
      i++
    }

    const deletes = run.filter((l) => l.op === 'delete')
    const inserts = run.filter((l) => l.op === 'insert')
    const wordsByLine = new Map<DiffLine, WordSpan[]>()
    const pairs: Array<{ left?: DiffLine; right?: DiffLine }> = []
    const pairCount = Math.max(deletes.length, inserts.length)

    for (let p = 0; p < pairCount; p++) {
      const left = deletes[p]
      const right = inserts[p]
      if (left && right) {
        const words = diffWords(left.text, right.text)
        wordsByLine.set(left, words.filter((w) => w.op !== 'insert'))
        wordsByLine.set(right, words.filter((w) => w.op !== 'delete'))
      }
      pairs.push({ left, right })
    }

    blocks.push({ kind: 'change', lines: run, wordsByLine, pairs })
  }

  return blocks
}

export interface ChangeGroupInfo {
  id: string
  index: number
}

export interface CollapseOptions {
  /** Equal runs at or under this length are always shown in full. */
  threshold: number
  /** Non-interactive mode: lines of context kept at each end of a long run. */
  context: number
  /** Collapses the whole run behind a click instead of showing static context. */
  interactive: boolean
}

export interface DiffViewProps {
  result: LineDiffResult
  mode: 'side-by-side' | 'unified'
  collapse?: CollapseOptions
  leftLabel?: string
  rightLabel?: string
  /** Namespaces DOM ids when more than one DiffView could ever be on a page. */
  idPrefix?: string
  /** Reports the change blocks after each recompute, for a "change N of M" nav UI. */
  onChangeGroups?: (groups: ChangeGroupInfo[]) => void
  className?: string
}

function renderWords(text: string, words: WordSpan[] | undefined): ReactNode {
  if (!words) return text
  return words.map((w, idx) =>
    w.op === 'equal' ? (
      <span key={idx}>{w.text}</span>
    ) : (
      <mark key={idx} className={w.op === 'delete' ? styles.wordDel : styles.wordIns}>
        {w.text}
      </mark>
    ),
  )
}

export function DiffView({
  result,
  mode,
  collapse,
  leftLabel = 'left',
  rightLabel = 'right',
  idPrefix = 'diff',
  onChangeGroups,
  className,
}: DiffViewProps) {
  const blocks = useMemo(() => buildBlocks(result.lines), [result])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  // A fresh diff invalidates whichever collapsed runs the user had opened.
  useEffect(() => setExpanded(new Set()), [blocks])

  const changeGroups = useMemo(() => {
    let n = 0
    const groups: ChangeGroupInfo[] = []
    blocks.forEach((block, blockIndex) => {
      if (block.kind !== 'change') return
      groups.push({ id: `${idPrefix}-change-${blockIndex}`, index: n })
      n++
    })
    return groups
  }, [blocks, idPrefix])

  useEffect(() => {
    onChangeGroups?.(changeGroups)
  }, [changeGroups, onChangeGroups])

  const toggle = (blockIndex: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(blockIndex)) next.delete(blockIndex)
      else next.add(blockIndex)
      return next
    })
  }

  return (
    <div
      className={cx(styles.view, mode === 'unified' ? styles.unified : styles.sideBySide, className)}
      role="group"
      aria-label={`Diff between ${leftLabel} and ${rightLabel}, ${mode === 'unified' ? 'unified' : 'side by side'} view`}
    >
      {mode === 'side-by-side' && (
        <div className={styles.header}>
          <span className={styles.headerCell}>{leftLabel}</span>
          <span className={styles.headerCell}>{rightLabel}</span>
        </div>
      )}
      <div className={styles.rows}>
        {blocks.map((block, blockIndex) =>
          block.kind === 'equal' ? (
            <EqualRows
              key={blockIndex}
              block={block}
              mode={mode}
              collapse={collapse}
              expanded={expanded.has(blockIndex)}
              onToggle={() => toggle(blockIndex)}
            />
          ) : (
            <ChangeRows
              key={blockIndex}
              block={block}
              mode={mode}
              id={`${idPrefix}-change-${blockIndex}`}
            />
          ),
        )}
      </div>
    </div>
  )
}

function EqualRows({
  block,
  mode,
  collapse,
  expanded,
  onToggle,
}: {
  block: EqualBlock
  mode: 'side-by-side' | 'unified'
  collapse: CollapseOptions | undefined
  expanded: boolean
  onToggle: () => void
}) {
  const { lines } = block

  if (!collapse || lines.length <= collapse.threshold) {
    return <>{lines.map((line, i) => <PlainRow key={i} line={line} mode={mode} />)}</>
  }

  if (collapse.interactive) {
    if (expanded) {
      return (
        <>
          <CollapseToggle count={lines.length} expanded onClick={onToggle} mode={mode} />
          {lines.map((line, i) => (
            <PlainRow key={i} line={line} mode={mode} />
          ))}
        </>
      )
    }
    return <CollapseToggle count={lines.length} expanded={false} onClick={onToggle} mode={mode} />
  }

  const ctx = collapse.context
  if (lines.length <= ctx * 2) {
    return <>{lines.map((line, i) => <PlainRow key={i} line={line} mode={mode} />)}</>
  }
  const head = lines.slice(0, ctx)
  const tail = ctx > 0 ? lines.slice(lines.length - ctx) : []
  const hidden = lines.length - head.length - tail.length

  return (
    <>
      {head.map((line, i) => (
        <PlainRow key={`h${i}`} line={line} mode={mode} />
      ))}
      <div className={cx(styles.row, styles.separator)}>
        <span className={styles.separatorLabel}>⋯ {pluralize(hidden, 'unchanged line')} hidden ⋯</span>
      </div>
      {tail.map((line, i) => (
        <PlainRow key={`t${i}`} line={line} mode={mode} />
      ))}
    </>
  )
}

function CollapseToggle({
  count,
  expanded,
  onClick,
  mode,
}: {
  count: number
  expanded: boolean
  onClick: () => void
  mode: 'side-by-side' | 'unified'
}) {
  return (
    <div className={cx(styles.row, styles.collapseRow, mode === 'unified' && styles.unifiedRow)}>
      <button
        type="button"
        className={styles.collapseButton}
        onClick={onClick}
        aria-expanded={expanded}
      >
        <IconChevronRight size={12} className={cx(styles.chevron, expanded && styles.chevronOpen)} />
        {expanded ? 'Collapse' : pluralize(count, 'unchanged line')}
      </button>
    </div>
  )
}

function PlainRow({ line, mode }: { line: DiffLine; mode: 'side-by-side' | 'unified' }) {
  if (mode === 'unified') {
    return (
      <div className={cx(styles.row, styles.unifiedRow)}>
        <span className={styles.gutter}>{line.leftNo ?? ''}</span>
        <span className={styles.gutter}>{line.rightNo ?? ''}</span>
        <span className={styles.marker}> </span>
        <span className={styles.text}>{line.text}</span>
      </div>
    )
  }
  return (
    <div className={styles.row}>
      <Side line={line} words={undefined} />
      <Side line={line} words={undefined} />
    </div>
  )
}

function Side({ line, words }: { line: DiffLine | undefined; words: WordSpan[] | undefined }) {
  if (!line) return <span className={cx(styles.side, styles.sideEmpty)} />
  const tone = line.op === 'insert' ? styles.sideAdded : line.op === 'delete' ? styles.sideRemoved : undefined
  const no = line.leftNo ?? line.rightNo
  return (
    <span className={cx(styles.side, tone)}>
      <span className={styles.gutter}>{no ?? ''}</span>
      <span className={styles.text}>{renderWords(line.text, words)}</span>
    </span>
  )
}

function ChangeRows({ block, mode, id }: { block: ChangeBlock; mode: 'side-by-side' | 'unified'; id: string }) {
  if (mode === 'unified') {
    return (
      <div id={id}>
        {block.lines.map((line, i) => (
          <div
            key={i}
            className={cx(
              styles.row,
              styles.unifiedRow,
              line.op === 'insert' ? styles.rowAdded : styles.rowRemoved,
            )}
          >
            <span className={styles.gutter}>{line.leftNo ?? ''}</span>
            <span className={styles.gutter}>{line.rightNo ?? ''}</span>
            <span className={styles.marker}>{line.op === 'insert' ? '+' : '-'}</span>
            <span className={styles.text}>{renderWords(line.text, block.wordsByLine.get(line))}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div id={id}>
      {block.pairs.map((pair, i) => (
        <div key={i} className={cx(styles.row, styles.rowChanged)}>
          <Side line={pair.left} words={pair.left ? block.wordsByLine.get(pair.left) : undefined} />
          <Side line={pair.right} words={pair.right ? block.wordsByLine.get(pair.right) : undefined} />
        </div>
      ))}
    </div>
  )
}
