import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Checkbox, Field, TextInput } from '@/components/Field'
import { IconTrash, IconUpload } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { formatBytes, pluralize } from '@/lib/format'
import { useToast } from '@/components/Toast'
import {
  ALGORITHMS,
  BROKEN_ALGORITHMS,
  bytesToBase64,
  bytesToHex,
  compareDigest,
  digest,
  type HashAlgorithm,
} from './hash'

interface State {
  input: string
  uppercase: boolean
  base64: boolean
  compareWith: string
}

const DEFAULTS: State = {
  input: '',
  uppercase: false,
  base64: false,
  compareWith: '',
}

const isState = shapeValidator<State>({
  input: 'string',
  uppercase: 'boolean',
  base64: 'boolean',
  compareWith: 'string',
})

const MAX_FILE_BYTES = 64 * 1024 * 1024
const SAMPLE_INPUT = 'The quick brown fox jumps over the lazy dog'

interface DigestRow {
  algorithm: HashAlgorithm
  hex: string
  hexUpper: string
  base64: string
}

export default function HashGeneratorTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const toast = useToast()
  // See the JWT tool for why this is generated here rather than left to
  // `Field`'s own internal id: `Field` has no way to hand that id back to
  // whatever `children` it wraps.
  const compareFieldId = useId()
  const fileRef = useRef<HTMLInputElement | null>(null)

  // `Uint8Array<ArrayBuffer>` rather than plain `Uint8Array`: Web Crypto takes
  // a BufferSource, which excludes views backed by a SharedArrayBuffer.
  const [file, setFile] = useState<
    { name: string; size: number; bytes: Uint8Array<ArrayBuffer> } | undefined
  >()
  const [rows, setRows] = useState<DigestRow[]>([])
  const [computing, setComputing] = useState(false)

  const sourceBytes = useMemo<Uint8Array<ArrayBuffer> | undefined>(() => {
    if (file) return file.bytes
    if (state.input === '') return undefined
    return new TextEncoder().encode(state.input)
  }, [file, state.input])

  // Hashing is async (Web Crypto for the SHA family), so all six algorithms
  // are computed in an effect rather than a useMemo. `stale` guards against a
  // slower earlier computation (a large file) painting over a newer, faster
  // one if the input changes again before it finishes.
  useEffect(() => {
    // No early setRows([]) here: clearing is derived below from the absence of
    // input, which avoids a cascading render on every keystroke that empties
    // the field.
    if (!sourceBytes) return
    let stale = false
    // Flipping the busy flag is precisely "update an external system with the
    // latest state" — it exists to describe work this effect is starting. The
    // rule cannot tell that apart from deriving state, so it is silenced here
    // with the reason rather than reshaped into something less clear.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComputing(true)
    void Promise.all(ALGORITHMS.map((algorithm) => digest(algorithm, sourceBytes)))
      .then((results) => {
        if (stale) return
        // Zip against the same ALGORITHMS array `digest` was mapped over,
        // rather than indexing `results` by position, so no cast is needed
        // to recover which algorithm produced which digest.
        setRows(
          ALGORITHMS.map((algorithm, i) => {
            const bytes = results[i] ?? new Uint8Array()
            return {
              algorithm,
              hex: bytesToHex(bytes),
              hexUpper: bytesToHex(bytes, true),
              base64: bytesToBase64(bytes),
            }
          }),
        )
      })
      .finally(() => {
        if (!stale) setComputing(false)
      })
    return () => {
      stale = true
    }
  }, [sourceBytes])

  const compareResult = useMemo(() => {
    if (!state.compareWith.trim() || rows.length === 0) return undefined
    const digests: Partial<Record<HashAlgorithm, { hex: string; hexUpper: string }>> = {}
    for (const row of rows) digests[row.algorithm] = { hex: row.hex, hexUpper: row.hexUpper }
    return compareDigest(state.compareWith, digests)
  }, [state.compareWith, rows])

  const loadFile = async (picked: File | undefined) => {
    if (!picked) return
    if (picked.size > MAX_FILE_BYTES) {
      toast.show(
        `${picked.name} is ${formatBytes(picked.size)}. Files above ${formatBytes(MAX_FILE_BYTES)} are refused to keep the tab responsive.`,
        'err',
      )
      return
    }
    const bytes = new Uint8Array(await picked.arrayBuffer())
    setFile({ name: picked.name, size: picked.size, bytes })
    patch({ input: '' })
  }

  const clear = () => {
    patch({ input: '', compareWith: '' })
    setFile(undefined)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <ToolShell
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFile(undefined)
              patch({ input: SAMPLE_INPUT })
            }}
          >
            Sample
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
            aria-label="Load a file and hash its bytes"
          />
          <Button size="sm" variant="ghost" onClick={clear} disabled={!state.input && !file}>
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup>
          <Checkbox
            label="Uppercase hex"
            checked={state.uppercase}
            onChange={(e) => patch({ uppercase: e.target.checked })}
          />
          <Checkbox
            label="Show Base64"
            checked={state.base64}
            onChange={(e) => patch({ base64: e.target.checked })}
          />
        </OptionGroup>
        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        <Panel
          label={file ? 'File' : 'Text input'}
          status={
            file
              ? `${file.name} · ${formatBytes(file.size)}`
              : state.input
                ? pluralize(state.input.length, 'char')
                : undefined
          }
        >
          {file ? (
            <div
              style={{
                padding: 'var(--sp-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-2)',
              }}
            >
              <Callout tone="info" title={file.name}>
                {formatBytes(file.size)} loaded. Switch back to typed text with Clear, or load a
                different file.
              </Callout>
            </div>
          ) : (
            <CodeArea
              label="Text to hash"
              value={state.input}
              onValueChange={(input) => patch({ input })}
              softWrap
              acceptDrop
              maxDropBytes={MAX_FILE_BYTES}
              placeholder="Type or paste text, or use File to hash a dropped file's bytes directly."
            />
          )}
        </Panel>

        <Panel
          label="Digests"
          status={
            computing ? 'computing…' : rows.length ? pluralize(rows.length, 'algorithm') : undefined
          }
        >
          {!sourceBytes ? (
            <div
              style={{
                padding: 'var(--sp-3)',
                color: 'var(--fg-subtle)',
                fontSize: 'var(--text-sm)',
              }}
            >
              Nothing to hash yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row) => {
                const value = state.base64 ? row.base64 : state.uppercase ? row.hexUpper : row.hex
                const broken = BROKEN_ALGORITHMS.has(row.algorithm)
                return (
                  <div
                    key={row.algorithm}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-3)',
                      padding: 'var(--sp-2) var(--sp-3)',
                      borderBottom: 'var(--hairline) solid var(--line-faint)',
                    }}
                  >
                    <div style={{ width: '5.5rem', flexShrink: 0 }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 600,
                          color: broken ? 'var(--warn)' : 'var(--fg)',
                        }}
                      >
                        {row.algorithm}
                      </span>
                      {broken && (
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-subtle)' }}>
                          {row.algorithm === 'MD5'
                            ? 'broken — checksums only'
                            : 'broken — legacy only'}
                        </div>
                      )}
                    </div>
                    <code
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {value}
                    </code>
                    <CopyButton value={value} iconOnly label={`Copy ${row.algorithm} digest`} />
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        {rows.length > 0 && (
          <Panel label="Compare with">
            <div
              style={{
                padding: 'var(--sp-3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--sp-2)',
              }}
            >
              <Field
                label="Expected digest"
                htmlFor={compareFieldId}
                hint="Paste a hex digest — matched automatically by its length."
              >
                <TextInput
                  id={compareFieldId}
                  aria-describedby={`${compareFieldId}-hint`}
                  mono
                  value={state.compareWith}
                  onChange={(e) => patch({ compareWith: e.target.value })}
                  placeholder="e.g. 900150983cd24fb0d6963f7d28e17f72"
                />
              </Field>
              {compareResult && (
                <Callout
                  tone={compareResult.ok ? 'ok' : 'err'}
                  title={compareResult.ok ? 'Match' : 'No match'}
                  live
                >
                  {compareResult.message}
                </Callout>
              )}
            </div>
          </Panel>
        )}
      </PaneStack>
    </ToolShell>
  )
}
