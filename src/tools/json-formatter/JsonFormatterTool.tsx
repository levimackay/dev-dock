import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { StatGrid, type Stat } from '@/components/StatGrid'
import { Checkbox, SegmentedControl } from '@/components/Field'
import { IconDownload, IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { useHotkey } from '@/lib/useHotkey'
import { byteLength, formatBytes, pluralize } from '@/lib/format'
import { downloadText } from '@/lib/download'
import { type IndentOption, type JsonMode, processJson } from './json'

interface State {
  input: string
  mode: JsonMode
  indent: IndentOption
  sortKeys: boolean
  escapeNonAscii: boolean
}

const DEFAULTS: State = {
  input: '',
  mode: 'pretty',
  indent: '2',
  sortKeys: false,
  escapeNonAscii: false,
}

const isState = shapeValidator<State>({
  input: 'string',
  mode: 'string',
  indent: 'string',
  sortKeys: 'boolean',
  escapeNonAscii: 'boolean',
})

const SAMPLE = `{
  "id": "ord_7f3a9c",
  "status": "processing",
  "total": 128.5,
  "currency": "USD",
  "rush": false,
  "notes": null,
  "customer": {
    "name": "Renée Dupont",
    "tier": "gold",
    "email": "renee@example.com"
  },
  "items": [
    { "sku": "WDG-001", "qty": 2, "price": 39.99 },
    { "sku": "GDT-014", "qty": 1, "price": 48.52 }
  ],
  "tags": ["priority", "gift-wrap", "日本語"]
}`

export default function JsonFormatterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const result = useMemo(
    () =>
      processJson(state.input, state.mode, {
        indent: state.indent,
        sortKeys: state.sortKeys,
        escapeNonAscii: state.escapeNonAscii,
      }),
    [state.input, state.mode, state.indent, state.sortKeys, state.escapeNonAscii],
  )

  useHotkey(
    'mod+shift+backspace',
    (e) => {
      e.preventDefault()
      patch({ input: '' })
    },
    { allowInInput: true },
  )

  const stats: Stat[] | undefined =
    result.ok && state.input.trim() !== ''
      ? [
          { label: 'Root', value: result.stats.root },
          {
            label: 'Size',
            value: `${formatBytes(result.stats.bytesBefore)} → ${formatBytes(result.stats.bytesAfter)}`,
          },
          { label: 'Max depth', value: result.stats.maxDepth },
          { label: 'Objects', value: result.stats.objectCount },
          { label: 'Arrays', value: result.stats.arrayCount },
          { label: 'Keys', value: result.stats.keyCount },
        ]
      : undefined

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
            onClick={() =>
              downloadText('data.json', result.ok ? result.output : '', 'application/json')
            }
            disabled={!result.ok || !result.output}
          >
            <IconDownload size={13} />
            Download
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
        <OptionGroup>
          <SegmentedControl
            label="Mode"
            value={state.mode}
            onChange={(mode) => patch({ mode })}
            options={[
              { value: 'pretty', label: 'Pretty' },
              { value: 'minify', label: 'Minify' },
              { value: 'validate', label: 'Validate' },
            ]}
          />
        </OptionGroup>

        {state.mode === 'pretty' && (
          <OptionGroup label="Indent">
            <SegmentedControl
              label="Indent"
              value={state.indent}
              onChange={(indent) => patch({ indent })}
              options={[
                { value: '2', label: '2' },
                { value: '4', label: '4' },
                { value: 'tab', label: 'Tab' },
              ]}
            />
          </OptionGroup>
        )}

        {state.mode !== 'validate' && (
          <OptionGroup>
            <Checkbox
              label="Sort keys"
              checked={state.sortKeys}
              onChange={(e) => patch({ sortKeys: e.target.checked })}
            />
            <Checkbox
              label="Escape non-ASCII"
              checked={state.escapeNonAscii}
              onChange={(e) => patch({ escapeNonAscii: e.target.checked })}
            />
          </OptionGroup>
        )}

        <OptionSpacer />
      </OptionsBar>

      <TwoPane
        storageKey="json-formatter"
        input={
          <Panel
            label="JSON"
            status={
              state.input
                ? `${pluralize(state.input.length, 'char')} · ${formatBytes(byteLength(state.input))}`
                : undefined
            }
          >
            <CodeArea
              label="JSON to format"
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
            label={
              state.mode === 'validate'
                ? 'Result'
                : state.mode === 'minify'
                  ? 'Minified'
                  : 'Formatted'
            }
            tone={result.ok ? 'default' : 'err'}
            status={
              result.ok && result.output ? pluralize(result.output.length, 'char') : undefined
            }
            actions={
              <CopyButton
                value={result.ok ? result.output : ''}
                disabled={!result.ok || !result.output}
              />
            }
            footer={stats && <StatGrid stats={stats} />}
          >
            {!result.ok ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <Callout tone="err" title="Cannot parse this JSON" live>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'inherit' }}>
                    {result.error}
                  </pre>
                </Callout>
              </div>
            ) : !state.input ? (
              <EmptyState compact title="Nothing to format yet" mark={<IconLayers size={24} />}>
                Paste JSON on the left, drop a .json file onto it, or load the sample.
              </EmptyState>
            ) : state.mode === 'validate' ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <Callout tone="ok" title="Valid JSON" live>
                  Parses cleanly. See the breakdown below.
                </Callout>
              </div>
            ) : (
              <CodeArea
                label="Result"
                value={result.output}
                readOnly
                lineNumbers={state.mode === 'pretty'}
                softWrap={state.mode === 'minify'}
              />
            )}
          </Panel>
        }
      />
    </ToolShell>
  )
}
