import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, SegmentedControl } from '@/components/Field'
import { IconArrowSwap, IconGlobe, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import {
  REPEAT_DECODE_CAP,
  countChangedChars,
  decodeUrl,
  encodeUrl,
  type UrlEncodeMode,
} from './urlcodec'

interface State {
  input: string
  direction: 'encode' | 'decode'
  mode: UrlEncodeMode
  repeat: boolean
}

const DEFAULTS: State = {
  input: '',
  direction: 'encode',
  mode: 'component',
  repeat: false,
}

const isState = shapeValidator<State>({
  input: 'string',
  direction: 'string',
  mode: 'string',
  repeat: 'boolean',
})

const MODE_HINTS: Record<UrlEncodeMode, string> = {
  component:
    'encodeURIComponent — for a value going into a URL (a query param, a path segment). Escapes “& = ? #” so they can’t be mistaken for URL structure.',
  full: 'encodeURI — for a string that is already a whole URL. Leaves “: / ? # & =” alone because those are structural, not content.',
  form: 'application/x-www-form-urlencoded — what an HTML form actually sends. Like “component”, but a space becomes “+” instead of “%20”.',
}

const SAMPLE_INPUT = 'https://example.com/search?q=coffee & cream/café?#ref'

export default function UrlEncoderTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const result = useMemo(() => {
    if (state.direction === 'encode') {
      const output = encodeUrl(state.input, state.mode)
      return { output, error: undefined as string | undefined, passes: 1, hitCap: false }
    }
    const decoded = decodeUrl(state.input, state.mode, state.repeat)
    return {
      output: decoded.text,
      error: decoded.error,
      passes: decoded.passes,
      hitCap: decoded.hitCap,
    }
  }, [state])

  const changedChars = result.error ? 0 : countChangedChars(state.input, result.output)

  /** Encoding then decoding the output puts the user where they expect to be. */
  const swap = () => {
    patch({ input: result.output, direction: state.direction === 'encode' ? 'decode' : 'encode' })
  }

  return (
    <ToolShell
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: SAMPLE_INPUT, direction: 'encode' })}
          >
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={swap}
            disabled={!result.output || Boolean(result.error)}
          >
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
              { value: 'encode', label: 'Encode' },
              { value: 'decode', label: 'Decode' },
            ]}
          />
        </OptionGroup>

        <OptionGroup label="Mode">
          <SegmentedControl
            label="Encoding mode"
            value={state.mode}
            onChange={(mode) => patch({ mode })}
            options={[
              { value: 'component', label: 'Component', title: 'encodeURIComponent' },
              { value: 'full', label: 'Full URL', title: 'encodeURI' },
              { value: 'form', label: 'Form', title: 'application/x-www-form-urlencoded' },
            ]}
          />
        </OptionGroup>

        {state.direction === 'decode' && (
          <OptionGroup>
            <Checkbox
              label={`Decode repeatedly (cap ${REPEAT_DECODE_CAP})`}
              checked={state.repeat}
              onChange={(e) => patch({ repeat: e.target.checked })}
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

      <TwoPane
        storageKey="url-encoder"
        input={
          <Panel
            label={state.direction === 'encode' ? 'Plain text' : 'Encoded'}
            status={state.input ? pluralize(state.input.length, 'char') : undefined}
          >
            <CodeArea
              label={state.direction === 'encode' ? 'Text to encode' : 'URL-encoded text to decode'}
              value={state.input}
              onValueChange={(input) => patch({ input })}
              softWrap
              placeholder={
                state.direction === 'encode'
                  ? 'Type or paste anything — a URL, a query value, a form field.'
                  : 'Paste percent-encoded (or form-encoded) text.'
              }
            />
          </Panel>
        }
        output={
          <Panel
            label={state.direction === 'encode' ? 'Encoded' : 'Decoded'}
            tone={result.error ? 'err' : 'default'}
            status={
              !result.error && result.output
                ? `${pluralize(result.output.length, 'char')} · ${pluralize(changedChars, 'char changed', 'chars changed')}`
                : undefined
            }
            actions={
              <CopyButton
                value={result.output}
                disabled={!result.output || Boolean(result.error)}
              />
            }
          >
            {result.error ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <Callout tone="err" title="Cannot decode this input" live>
                  {result.error}
                </Callout>
              </div>
            ) : !state.input ? (
              <EmptyState
                compact
                title={
                  state.direction === 'encode' ? 'Nothing to encode yet' : 'Nothing to decode yet'
                }
                mark={<IconGlobe size={24} />}
              >
                {state.direction === 'encode'
                  ? 'Type in the left pane, or load the Sample to see all three modes differ.'
                  : 'Paste percent-encoded text on the left.'}
              </EmptyState>
            ) : (
              <CodeArea label="Result" value={result.output} readOnly softWrap />
            )}
          </Panel>
        }
      />

      {!result.error && state.direction === 'decode' && state.repeat && state.input && (
        <div style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
          {result.hitCap ? (
            <Callout tone="warn" title={`Hit the ${REPEAT_DECODE_CAP}-pass cap`}>
              Output was still changing after {REPEAT_DECODE_CAP} decode passes, so decoding stopped
              rather than risk an infinite loop. This is either very deeply encoded input, or
              content that happens to look like valid percent-encoding at every layer.
            </Callout>
          ) : (
            result.passes > 1 && (
              <Callout
                tone="info"
                title={`Stabilised after ${pluralize(result.passes, 'pass', 'passes')}`}
              >
                The input was encoded {result.passes} time{result.passes === 1 ? '' : 's'} over.
              </Callout>
            )
          )}
        </div>
      )}
    </ToolShell>
  )
}
