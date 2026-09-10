import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/Field'
import { IconArrowSwap, IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import { escapeHtml, unescapeHtml, type EscapeMode } from './entities'

interface State {
  input: string
  direction: 'escape' | 'unescape'
  mode: EscapeMode
}

const DEFAULTS: State = {
  input: '',
  direction: 'escape',
  mode: 'minimal',
}

const isState = shapeValidator<State>({
  input: 'string',
  direction: 'string',
  mode: 'string',
})

const MODE_HINTS: Record<EscapeMode, string> = {
  minimal:
    'Only “& < > " \'” — the characters that are structurally dangerous in HTML text or an attribute. Everything else, including accented letters and emoji, passes through unchanged.',
  named:
    'Uses a named entity (&eacute; not &#233;) wherever one exists in the common table. Falls back to the literal character otherwise.',
  numeric:
    'Every non-ASCII character becomes a numeric reference (&#xE9;), which is the safest choice for output that has to survive an unknown or legacy character encoding.',
}

const SAMPLE_ESCAPE = `<div class="card">Café “life” — 50% off & 🌍 shipping</div>`
const SAMPLE_UNESCAPE =
  '&lt;div&gt; Caf&eacute; &ldquo;life&rdquo; &mdash; 50&#37; off &amp; &#x1F30D; shipping &lt;/div&gt;'

export default function HtmlEntitiesTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const output = useMemo(() => {
    return state.direction === 'escape'
      ? escapeHtml(state.input, state.mode)
      : unescapeHtml(state.input)
  }, [state])

  /** Escaping then unescaping the output puts the user where they expect to be. */
  const swap = () => {
    patch({ input: output, direction: state.direction === 'escape' ? 'unescape' : 'escape' })
  }

  const loadSample = () => {
    patch(state.direction === 'escape' ? { input: SAMPLE_ESCAPE } : { input: SAMPLE_UNESCAPE })
  }

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={loadSample}>
            Sample
          </Button>
          <Button size="sm" variant="ghost" onClick={swap} disabled={!output}>
            <IconArrowSwap size={13} />
            Swap
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup>
          <SegmentedControl
            label="Direction"
            value={state.direction}
            onChange={(direction) => patch({ direction })}
            options={[
              { value: 'escape', label: 'Escape' },
              { value: 'unescape', label: 'Unescape' },
            ]}
          />
        </OptionGroup>

        {state.direction === 'escape' && (
          <OptionGroup label="Mode">
            <SegmentedControl
              label="Escape mode"
              value={state.mode}
              onChange={(mode) => patch({ mode })}
              options={[
                { value: 'minimal', label: 'Minimal' },
                { value: 'named', label: 'Named' },
                { value: 'numeric', label: 'Numeric' },
              ]}
            />
          </OptionGroup>
        )}

        <OptionSpacer />

        <Button
          size="sm"
          variant="ghost"
          onClick={() => patch({ input: '' })}
          disabled={!state.input}
        >
          <IconTrash size={13} />
          Clear
        </Button>
      </OptionsBar>

      {state.direction === 'escape' && (
        <div style={{ padding: '0 var(--sp-3)' }}>
          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--fg-muted)',
              margin: 'var(--sp-2) 0',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            {MODE_HINTS[state.mode]}
          </p>
        </div>
      )}

      <TwoPane
        storageKey="html-entities"
        input={
          <Panel
            label={state.direction === 'escape' ? 'Plain text / HTML' : 'Escaped'}
            status={state.input ? pluralize(state.input.length, 'char') : undefined}
          >
            <CodeArea
              label={state.direction === 'escape' ? 'Text to escape' : 'Text to unescape'}
              value={state.input}
              onValueChange={(input) => patch({ input })}
              softWrap
              placeholder={
                state.direction === 'escape'
                  ? 'Type or paste text that may contain <, >, &, quotes, or non-ASCII characters.'
                  : 'Paste text containing HTML entities: &amp; &lt; &#39; &#x1F30D; and so on.'
              }
            />
          </Panel>
        }
        output={
          <Panel
            label={state.direction === 'escape' ? 'Escaped' : 'Decoded'}
            status={output ? pluralize(output.length, 'char') : undefined}
            actions={<CopyButton value={output} disabled={!output} />}
          >
            {!state.input ? (
              <EmptyState
                compact
                title={
                  state.direction === 'escape' ? 'Nothing to escape yet' : 'Nothing to unescape yet'
                }
                mark={<IconLayers size={24} />}
              >
                {state.direction === 'escape'
                  ? 'Type in the left pane, or load the Sample.'
                  : 'Paste HTML entities on the left. Decoding never parses markup — it only substitutes text, so it is safe on untrusted input.'}
              </EmptyState>
            ) : (
              <CodeArea label="Result" value={output} readOnly softWrap />
            )}
          </Panel>
        }
      />

      {state.direction === 'unescape' && state.input && (
        <div style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
          <Callout tone="info" title="This is safe on untrusted input">
            Decoding walks the string and substitutes recognised <code>&amp;name;</code>,{' '}
            <code>&amp;#123;</code>, and <code>&amp;#x7B;</code> references directly — it never
            assigns to <code>innerHTML</code>, so nothing here is ever parsed as markup or executed.
          </Callout>
        </div>
      )}
    </ToolShell>
  )
}
