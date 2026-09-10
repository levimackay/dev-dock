import { useMemo, useRef } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, SegmentedControl } from '@/components/Field'
import { IconArrowSwap, IconLayers, IconTrash, IconUpload } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { useHotkey } from '@/lib/useHotkey'
import { byteLength, formatBytes, pluralize } from '@/lib/format'
import { useToast } from '@/components/Toast'
import { bytesToBase64, decodeBase64, encodeBase64, looksLikeBase64 } from './base64'

interface State {
  input: string
  direction: 'encode' | 'decode'
  variant: 'standard' | 'urlsafe'
  lineBreaks: boolean
  padding: boolean
}

const DEFAULTS: State = {
  input: '',
  direction: 'encode',
  variant: 'standard',
  lineBreaks: false,
  padding: true,
}

const isState = shapeValidator<State>({
  input: 'string',
  direction: 'string',
  variant: 'string',
  lineBreaks: 'boolean',
  padding: 'boolean',
})

const MAX_FILE_BYTES = 8 * 1024 * 1024

export default function Base64Tool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()

  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const result = useMemo(() => {
    if (state.direction === 'encode') {
      return {
        output: encodeBase64(state.input, {
          variant: state.variant,
          lineBreaks: state.lineBreaks,
          padding: state.padding,
        }),
        error: undefined as string | undefined,
        binary: false,
      }
    }
    const decoded = decodeBase64(state.input)
    return { output: decoded.text, error: decoded.error, binary: Boolean(decoded.binary) }
  }, [state])

  /** Encoding then decoding the output puts the user where they expect to be. */
  const swap = () => {
    patch({
      input: result.output,
      direction: state.direction === 'encode' ? 'decode' : 'encode',
    })
  }

  const loadFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      toast.show(
        `${file.name} is ${formatBytes(file.size)}. Files above ${formatBytes(MAX_FILE_BYTES)} are refused to keep the tab responsive.`,
        'err',
      )
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    patch({ input: bytesToBase64(bytes), direction: 'decode' })
    toast.show(`Loaded ${file.name} as Base64 (${formatBytes(file.size)}).`, 'ok')
  }

  useHotkey(
    'mod+shift+c',
    (e) => {
      e.preventDefault()
      void navigator.clipboard?.writeText(result.output)
    },
    { allowInInput: true },
  )

  useHotkey(
    'mod+shift+backspace',
    (e) => {
      e.preventDefault()
      patch({ input: '' })
    },
    { allowInInput: true },
  )

  const suggestDecode =
    state.direction === 'encode' && state.input.length > 24 && looksLikeBase64(state.input)

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={swap} disabled={!result.output}>
            <IconArrowSwap size={13} />
            Swap
          </Button>
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            <IconUpload size={13} />
            File
          </Button>
          <input
            ref={fileRef}
            type="file"
            className="visually-hidden"
            onChange={(e) => {
              void loadFile(e.target.files?.[0])
              e.target.value = ''
            }}
            aria-label="Load a file and encode it as Base64"
          />
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

        {state.direction === 'encode' && (
          <>
            <OptionGroup label="Alphabet">
              <SegmentedControl
                label="Alphabet"
                value={state.variant}
                onChange={(variant) => patch({ variant })}
                options={[
                  { value: 'standard', label: 'Standard', title: '+ and /, RFC 4648 §4' },
                  { value: 'urlsafe', label: 'URL-safe', title: '- and _, RFC 4648 §5' },
                ]}
              />
            </OptionGroup>
            <OptionGroup>
              <Checkbox
                label="Pad with ="
                checked={state.padding}
                onChange={(e) => patch({ padding: e.target.checked })}
              />
              <Checkbox
                label="Wrap at 76"
                checked={state.lineBreaks}
                onChange={(e) => patch({ lineBreaks: e.target.checked })}
              />
            </OptionGroup>
          </>
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

      <TwoPane
        storageKey="base64"
        input={
          <Panel
            label={state.direction === 'encode' ? 'Plain text' : 'Base64'}
            status={
              state.input
                ? `${pluralize(state.input.length, 'char')} · ${formatBytes(byteLength(state.input))}`
                : undefined
            }
          >
            <CodeArea
              label={state.direction === 'encode' ? 'Text to encode' : 'Base64 to decode'}
              value={state.input}
              onValueChange={(input) => patch({ input })}
              softWrap
              acceptDrop
              placeholder={
                state.direction === 'encode'
                  ? 'Type or paste anything. UTF-8 is handled correctly, including emoji.'
                  : 'Paste Base64. Padding, whitespace, URL-safe characters and data: prefixes are all accepted.'
              }
            />
          </Panel>
        }
        output={
          <Panel
            label={
              result.binary
                ? 'Decoded (binary)'
                : state.direction === 'encode'
                  ? 'Base64'
                  : 'Plain text'
            }
            tone={result.error ? 'err' : 'default'}
            status={
              result.output && !result.error ? pluralize(result.output.length, 'char') : undefined
            }
            actions={
              <CopyButton value={result.output} disabled={!result.output || !!result.error} />
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
                mark={<IconLayers size={24} />}
              >
                {state.direction === 'encode'
                  ? 'Type in the left pane, drop a text file onto it, or use File to encode any file’s bytes.'
                  : 'Paste a Base64 string on the left. Binary payloads come back as a hex dump instead of mojibake.'}
              </EmptyState>
            ) : (
              <CodeArea
                label="Result"
                value={result.output}
                readOnly
                softWrap={!result.binary}
                lineNumbers={result.binary}
              />
            )}
          </Panel>
        }
      />

      {(suggestDecode || result.binary) && (
        <div style={{ padding: '0 var(--sp-3) var(--sp-3)' }}>
          {suggestDecode && (
            <Callout tone="info" title="This looks like Base64 already">
              You are in encode mode.{' '}
              <Button size="sm" variant="ghost" onClick={() => patch({ direction: 'decode' })}>
                Switch to decode
              </Button>
            </Callout>
          )}
          {result.binary && (
            <Callout tone="warn" title="Decoded bytes are not valid UTF-8 text">
              Showing a hex dump instead. That is normal for images, archives, and protobuf
              payloads.
            </Callout>
          )}
        </div>
      )}
    </ToolShell>
  )
}
