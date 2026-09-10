import { useId, useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Field, Checkbox, SegmentedControl, TextInput } from '@/components/Field'
import { IconRefresh, IconShield, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import {
  DEFAULT_BULK_FORMAT,
  DEFAULT_NANOID_ALPHABET,
  DEFAULT_NANOID_LENGTH,
  MAX_NANOID_LENGTH,
  decodeUuid,
  formatBulk,
  generateNanoId,
  generateUlid,
  generateUuidV4,
  generateUuidV7,
  type BulkFormatOptions,
} from './ids'

type IdKind = 'uuidv4' | 'uuidv7' | 'nanoid' | 'ulid'

// Generated ids never go into share state: a link encoding 1000 freshly
// rolled UUIDs would be enormous and, being random, meaningless to whoever
// opened it, the *options* that produced them are what's worth sharing.
interface State extends BulkFormatOptions {
  kind: IdKind
  count: number
  nanoidLength: number
  nanoidAlphabet: string
  decodeInput: string
}

const DEFAULTS: State = {
  kind: 'uuidv4',
  count: 5,
  nanoidLength: DEFAULT_NANOID_LENGTH,
  nanoidAlphabet: DEFAULT_NANOID_ALPHABET,
  decodeInput: '',
  ...DEFAULT_BULK_FORMAT,
}

const isState = shapeValidator<State>({
  kind: 'string',
  count: 'number',
  nanoidLength: 'number',
  nanoidAlphabet: 'string',
  decodeInput: 'string',
  uppercase: 'boolean',
  noHyphens: 'boolean',
  braces: 'boolean',
  quoted: 'boolean',
  commaSeparated: 'boolean',
  sql: 'boolean',
  json: 'boolean',
})

const MAX_COUNT = 1000

const KIND_LABEL: Record<IdKind, string> = {
  uuidv4: 'UUID v4',
  uuidv7: 'UUID v7',
  nanoid: 'NanoID',
  ulid: 'ULID',
}

function generateOne(kind: IdKind, nanoidLength: number, nanoidAlphabet: string): string {
  switch (kind) {
    case 'uuidv4':
      return generateUuidV4()
    case 'uuidv7':
      return generateUuidV7()
    case 'nanoid':
      return generateNanoId(nanoidLength, nanoidAlphabet || DEFAULT_NANOID_ALPHABET)
    case 'ulid':
      return generateUlid()
  }
}

export default function UuidGeneratorTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const lengthFieldId = useId()
  const alphabetFieldId = useId()
  const decodeFieldId = useId()

  // The rolled ids themselves: plain state, never shared. See the comment
  // on `State` above.
  const [ids, setIds] = useState<string[]>([])

  const [rollError, setRollError] = useState<string | undefined>(undefined)

  const roll = () => {
    // Everything the generators are handed is clamped here, not at the input.
    // The `max` attribute on a number field is a validity hint the browser does
    // not enforce, and share state never passes through the field at all: a
    // link carrying `nanoidLength: 100000` reached `crypto.getRandomValues`
    // directly, which throws QuotaExceededError past 65,536 bytes. That throw
    // came from a click handler, where an error boundary cannot catch it, so
    // the button simply did nothing.
    const count = Math.min(MAX_COUNT, Math.max(1, Math.floor(state.count) || 1))
    const nanoidLength = Math.min(
      MAX_NANOID_LENGTH,
      Math.max(1, Math.floor(state.nanoidLength) || DEFAULT_NANOID_LENGTH),
    )

    try {
      setIds(
        Array.from({ length: count }, () =>
          generateOne(state.kind, nanoidLength, state.nanoidAlphabet),
        ),
      )
      setRollError(undefined)
    } catch (error) {
      setIds([])
      setRollError(error instanceof Error ? error.message : 'Could not generate those ids.')
    }
  }

  const output = useMemo(() => formatBulk(ids, state), [ids, state])
  const decoded = useMemo(
    () => (state.decodeInput.trim() ? decodeUuid(state.decodeInput) : undefined),
    [state.decodeInput],
  )

  return (
    <ToolShell
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              patch({ decodeInput: generateUuidV7() })
              roll()
            }}
          >
            Sample
          </Button>
          <Button size="sm" variant="primary" onClick={roll}>
            <IconRefresh size={13} />
            Generate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setIds([])} disabled={ids.length === 0}>
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup label="Kind">
          <SegmentedControl
            label="ID kind"
            value={state.kind}
            onChange={(kind) => patch({ kind })}
            options={[
              { value: 'uuidv4', label: 'UUID v4' },
              { value: 'uuidv7', label: 'UUID v7' },
              { value: 'nanoid', label: 'NanoID' },
              { value: 'ulid', label: 'ULID' },
            ]}
          />
        </OptionGroup>

        <OptionGroup label="Count">
          <TextInput
            type="number"
            min={1}
            max={MAX_COUNT}
            mono
            value={state.count}
            onChange={(e) => patch({ count: Number(e.target.value) })}
            style={{ width: '5rem' }}
            aria-label="Number of ids to generate"
          />
        </OptionGroup>

        {state.kind === 'nanoid' && (
          <>
            <OptionGroup label="Length">
              <TextInput
                id={lengthFieldId}
                type="number"
                min={1}
                max={128}
                mono
                value={state.nanoidLength}
                onChange={(e) => patch({ nanoidLength: Number(e.target.value) })}
                style={{ width: '4rem' }}
                aria-label="NanoID length"
              />
            </OptionGroup>
            <OptionGroup label="Alphabet">
              <TextInput
                id={alphabetFieldId}
                mono
                value={state.nanoidAlphabet}
                onChange={(e) => patch({ nanoidAlphabet: e.target.value })}
                placeholder={DEFAULT_NANOID_ALPHABET}
                style={{ width: '14rem' }}
                aria-label="NanoID alphabet"
              />
            </OptionGroup>
          </>
        )}

        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        <Callout tone="info" title="Randomness comes from the platform CSPRNG">
          Every id here is built from <code>crypto.getRandomValues</code>, never{' '}
          <code>Math.random()</code>, the latter is fast but not unpredictable enough to use as an
          identifier that must not be guessable.
        </Callout>

        <Panel label="Format">
          <div
            style={{
              padding: 'var(--sp-3)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--sp-3) var(--sp-4)',
            }}
          >
            <Checkbox
              label="Uppercase"
              checked={state.uppercase}
              onChange={(e) => patch({ uppercase: e.target.checked })}
            />
            <Checkbox
              label="No hyphens"
              checked={state.noHyphens}
              onChange={(e) => patch({ noHyphens: e.target.checked })}
            />
            <Checkbox
              label="Braces"
              checked={state.braces}
              onChange={(e) => patch({ braces: e.target.checked })}
            />
            <Checkbox
              label="Quoted"
              checked={state.quoted}
              onChange={(e) => patch({ quoted: e.target.checked })}
              disabled={state.sql || state.json}
            />
            <Checkbox
              label="Comma-separated"
              checked={state.commaSeparated}
              onChange={(e) => patch({ commaSeparated: e.target.checked })}
              disabled={state.sql || state.json}
            />
            <Checkbox
              label="As SQL insert"
              checked={state.sql}
              onChange={(e) => patch({ sql: e.target.checked, json: false })}
            />
            <Checkbox
              label="As JSON array"
              checked={state.json}
              onChange={(e) => patch({ json: e.target.checked, sql: false })}
            />
          </div>
        </Panel>

        <Panel
          label={`${KIND_LABEL[state.kind]} output`}
          status={ids.length ? pluralize(ids.length, 'id') : undefined}
          actions={<CopyButton value={output} disabled={!output} />}
        >
          {rollError ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <Callout tone="err" title="Could not generate those ids" live>
                {rollError}
              </Callout>
            </div>
          ) : ids.length === 0 ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)', margin: 0 }}>
                Pick a kind and a count above, then Generate. Nothing here is shareable by link,
                regenerate whenever you need fresh ids, the options above are all a share link
                carries.
              </p>
            </div>
          ) : (
            <CodeArea
              label="Generated ids"
              value={output}
              readOnly
              softWrap={state.json || state.sql}
              lineNumbers={!state.json && !state.sql}
            />
          )}
        </Panel>

        <Panel label="Decode a UUID">
          <div
            style={{
              padding: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-3)',
            }}
          >
            <Field
              label="UUID"
              htmlFor={decodeFieldId}
              hint="Hyphenated, bare hex, or brace-wrapped, all accepted."
            >
              <TextInput
                id={decodeFieldId}
                mono
                value={state.decodeInput}
                onChange={(e) => patch({ decodeInput: e.target.value })}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </Field>

            {!state.decodeInput.trim() ? null : !decoded?.ok ? (
              <Callout tone="err" title="Cannot decode this input" live>
                {decoded?.error}
              </Callout>
            ) : (
              <div
                style={{
                  border: 'var(--hairline) solid var(--line)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                <DecodeRow label="Canonical" value={decoded.canonical!} />
                <DecodeRow label="Version" value={String(decoded.version)} />
                <DecodeRow label="Variant" value={decoded.variant!} />
                {decoded.timestamp && (
                  <DecodeRow label="Embedded time" value={decoded.timestamp.toISOString()} />
                )}
                {!decoded.timestamp && decoded.version === 4 && (
                  <div
                    style={{
                      padding: 'var(--sp-2) var(--sp-3)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--fg-subtle)',
                    }}
                  >
                    v4 is fully random. It has no embedded timestamp to extract.
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>

        <Callout tone="info" title="Why UUID v7 over v4 for a primary key">
          <IconShield size={12} style={{ verticalAlign: '-2px', marginRight: '0.35em' }} />A v4 UUID
          is uniformly random, so every insert lands at a random point in a B-tree index, no
          locality, constant page splits. v7 encodes creation time in its high bits, so inserts sort
          the way an auto-increment id always did, while the low bits stay random enough that a v7
          id still cannot be guessed or enumerated.
        </Callout>
      </PaneStack>
    </ToolShell>
  )
}

function DecodeRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-2) var(--sp-3)',
        borderBottom: 'var(--hairline) solid var(--line-faint)',
      }}
    >
      <span
        style={{
          width: '7rem',
          flexShrink: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-2xs)',
          letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase',
          color: 'var(--fg-subtle)',
        }}
      >
        {label}
      </span>
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
      <CopyButton value={value} iconOnly label={`Copy ${label}`} />
    </div>
  )
}
