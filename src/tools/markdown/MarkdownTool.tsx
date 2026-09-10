import { useEffect, useMemo, useRef } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Checkbox, SegmentedControl } from '@/components/Field'
import { IconDownload, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, twoPaneStyles } from '@/tools/shared/TwoPane'
import { SplitPane } from '@/components/SplitPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { downloadText } from '@/lib/download'
import { pluralize } from '@/lib/format'
import { useHotkey } from '@/lib/useHotkey'
import styles from './MarkdownTool.module.css'
import {
  countWords,
  estimateReadingMinutes,
  prefixLines,
  renderMarkdown,
  wrapSelection,
  type SelectionEdit,
} from './markdown'

interface State {
  source: string
  breaks: boolean
  view: 'edit' | 'split' | 'preview'
}

const SAMPLE = `# Dev Dock

A **toolbox** that runs entirely *in your browser* — nothing you paste here ever leaves the tab.

## Why a sanitised preview matters

This editor renders through \`marked\` and then through DOMPurify before it ever touches the DOM. Try pasting \`<script>alert(1)</script>\` above — it renders as inert text, not a running script.

- Real GFM tables
- Task-list-shaped bullets
- Fenced code blocks

> A blockquote, for a pull quote or an aside.

| Format | Sanitised |
| --- | --- |
| Markdown | Always |
| Raw HTML in markdown | Always |

[The repo](https://example.com) opens in a new tab with \`rel="noopener noreferrer"\` automatically.
`

const DEFAULTS: State = { source: '', breaks: false, view: 'split' }
const isState = shapeValidator<State>({ source: 'string', breaks: 'boolean', view: 'string' })

interface ToolbarAction {
  label: string
  title: string
  className?: string
  run: (value: string, start: number, end: number) => SelectionEdit
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    label: 'B',
    title: 'Bold (Mod+B)',
    className: styles.toolbarBtnBold,
    run: (v, s, e) => wrapSelection(v, s, e, '**', '**', 'bold text'),
  },
  {
    label: 'I',
    title: 'Italic (Mod+I)',
    className: styles.toolbarBtnItalic,
    run: (v, s, e) => wrapSelection(v, s, e, '_', '_', 'italic text'),
  },
  {
    label: '</>',
    title: 'Inline code',
    run: (v, s, e) => wrapSelection(v, s, e, '`', '`', 'code'),
  },
  {
    label: 'Link',
    title: 'Link (Mod+K)',
    run: (v, s, e) => wrapSelection(v, s, e, '[', '](https://)', 'link text'),
  },
  { label: 'H2', title: 'Heading', run: (v, s, e) => prefixLines(v, s, e, '## ') },
  { label: 'List', title: 'Bulleted list', run: (v, s, e) => prefixLines(v, s, e, '- ') },
  { label: 'Quote', title: 'Blockquote', run: (v, s, e) => prefixLines(v, s, e, '> ') },
]

export default function MarkdownTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRef = useRef<HTMLDivElement | null>(null)
  // Which pane most recently scrolled, so the reciprocal scroll event this
  // effect fires in response does not bounce straight back and fight it.
  const syncingRef = useRef<'source' | 'preview' | null>(null)

  const html = useMemo(
    () => renderMarkdown(state.source, { breaks: state.breaks }),
    [state.source, state.breaks],
  )
  const words = useMemo(() => countWords(state.source), [state.source])
  const minutes = estimateReadingMinutes(words)

  const applyToolbarAction = (action: ToolbarAction) => {
    const el = textareaRef.current
    if (!el) return
    const result = action.run(el.value, el.selectionStart, el.selectionEnd)
    patch({ source: result.value })
    // The textarea's own selection has to be restored after React re-renders
    // it with the new value — doing it synchronously here would race the
    // DOM update, the same reason CodeArea's own Tab handling queues a
    // microtask rather than calling setSelectionRange immediately.
    queueMicrotask(() => {
      el.focus()
      el.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  useHotkey(
    'mod+b',
    (e) => {
      e.preventDefault()
      applyToolbarAction(TOOLBAR_ACTIONS[0]!)
    },
    { allowInInput: true },
  )
  useHotkey(
    'mod+i',
    (e) => {
      e.preventDefault()
      applyToolbarAction(TOOLBAR_ACTIONS[1]!)
    },
    { allowInInput: true },
  )
  useHotkey(
    'mod+k',
    (e) => {
      e.preventDefault()
      applyToolbarAction(TOOLBAR_ACTIONS[3]!)
    },
    { allowInInput: true },
  )

  // Synced scroll in Split mode. This is a proportional approximation, not a
  // line-accurate one — a heading renders taller than a paragraph line, a
  // code block renders as a fixed-width box, so "40% down the source" and
  // "40% down the rendered document" are not the same point on the page.
  // Matching scroll *position* rather than scroll *ratio* would need a
  // source-map from character offset to rendered pixel offset, which is a
  // much bigger feature than a markdown preview warrants.
  useEffect(() => {
    if (state.view !== 'split') return
    const source = textareaRef.current
    const preview = previewRef.current
    if (!source || !preview) return

    const sync = (from: HTMLElement, to: HTMLElement, tag: 'source' | 'preview') => {
      if (syncingRef.current && syncingRef.current !== tag) return
      syncingRef.current = tag
      const fromRange = from.scrollHeight - from.clientHeight
      const ratio = fromRange <= 0 ? 0 : from.scrollTop / fromRange
      const toRange = to.scrollHeight - to.clientHeight
      to.scrollTop = toRange > 0 ? ratio * toRange : 0
      requestAnimationFrame(() => {
        syncingRef.current = null
      })
    }

    const onSource = () => sync(source, preview, 'source')
    const onPreview = () => sync(preview, source, 'preview')
    source.addEventListener('scroll', onSource, { passive: true })
    preview.addEventListener('scroll', onPreview, { passive: true })
    return () => {
      source.removeEventListener('scroll', onSource)
      preview.removeEventListener('scroll', onPreview)
    }
  }, [state.view])

  const editorPanel = (
    <Panel
      label="Markdown"
      status={state.source ? `${pluralize(words, 'word')} · ~${minutes || 1} min read` : undefined}
      actions={
        <>
          <CopyButton value={state.source} label="Copy markdown" disabled={!state.source} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => downloadText('document.md', state.source, 'text/markdown')}
            disabled={!state.source}
          >
            <IconDownload size={13} />
            .md
          </Button>
        </>
      }
    >
      <CodeArea
        ref={textareaRef}
        label="Markdown source"
        value={state.source}
        onValueChange={(source) => patch({ source })}
        softWrap
        acceptDrop
        placeholder="# Start writing…&#10;&#10;Paste a README, or load the Sample to see a fenced code block, a table, and a blockquote all rendered — and sanitised."
      />
    </Panel>
  )

  const previewPanel = (
    <Panel
      label="Preview"
      status={state.source ? `${pluralize(words, 'word')} · ~${minutes || 1} min read` : undefined}
      actions={<CopyButton value={html} label="Copy HTML" disabled={!html} />}
    >
      <div ref={previewRef} className={styles.scrollPane}>
        {html ? (
          // The one `dangerouslySetInnerHTML` in the entire codebase. `html`
          // comes from `renderMarkdown`, which runs every byte of it through
          // DOMPurify before it reaches this line — see markdown.ts for why
          // that is the only thing that makes this safe to do at all.
          <div className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div style={{ padding: 'var(--sp-6)', color: 'var(--fg-subtle)' }}>
            Nothing to preview yet. Start typing, or load the Sample.
          </div>
        )}
      </div>
    </Panel>
  )

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => patch({ source: SAMPLE })}>
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ source: '' })}
            disabled={!state.source}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup>
          <SegmentedControl
            label="View"
            value={state.view}
            onChange={(view) => patch({ view })}
            options={[
              { value: 'edit', label: 'Edit' },
              { value: 'split', label: 'Split' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        </OptionGroup>
        <OptionGroup>
          <Checkbox
            label="Soft line breaks"
            checked={state.breaks}
            onChange={(e) => patch({ breaks: e.target.checked })}
          />
        </OptionGroup>
        <OptionSpacer />
        <div className={styles.toolbar} role="toolbar" aria-label="Markdown formatting">
          {TOOLBAR_ACTIONS.map((action) => (
            <Button
              key={action.label}
              size="sm"
              variant="ghost"
              title={action.title}
              aria-label={action.title}
              className={`${styles.toolbarBtn} ${action.className ?? ''}`}
              onClick={() => applyToolbarAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </OptionsBar>

      {state.view === 'split' ? (
        <div className={twoPaneStyles.panes}>
          <SplitPane
            storageKey="markdown"
            labelFirst="markdown source"
            labelSecond="preview"
            first={<div className={twoPaneStyles.paneInner}>{editorPanel}</div>}
            second={<div className={twoPaneStyles.paneInner}>{previewPanel}</div>}
          />
        </div>
      ) : (
        <div className={styles.singlePane}>
          {state.view === 'edit' ? editorPanel : previewPanel}
        </div>
      )}
    </ToolShell>
  )
}
