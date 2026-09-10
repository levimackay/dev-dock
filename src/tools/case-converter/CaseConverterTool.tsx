import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, Select } from '@/components/Field'
import { IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import { CASES, convertText, type CaseId } from './cases'
import styles from './CaseConverterTool.module.css'

interface State {
  input: string
  primary: CaseId
  perLine: boolean
}

const DEFAULTS: State = {
  input: '',
  primary: 'camel',
  perLine: true,
}

const isState = shapeValidator<State>({
  input: 'string',
  primary: 'string',
  perLine: 'boolean',
})

const SAMPLE = `user_first_name
XMLHttpRequest
parseHTMLDocument
base64Encode
getUserID`

function isCaseId(value: string): value is CaseId {
  return CASES.some((c) => c.id === value)
}

export default function CaseConverterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const results = useMemo(
    () => CASES.map((def) => ({ def, value: convertText(state.input, def.id, state.perLine) })),
    [state.input, state.perLine],
  )

  const primaryResult = useMemo(
    () => convertText(state.input, state.primary, state.perLine),
    [state.input, state.primary, state.perLine],
  )

  const lineCount = state.input === '' ? 0 : state.input.split(/\r\n|\r|\n/).length

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
        <OptionGroup label="Primary output">
          <Select
            aria-label="Primary case"
            mono
            value={state.primary}
            onChange={(e) => {
              const { value } = e.target
              if (isCaseId(value)) patch({ primary: value })
            }}
          >
            {CASES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </OptionGroup>
        <OptionGroup>
          <Checkbox
            label="Convert each line separately"
            checked={state.perLine}
            onChange={(e) => patch({ perLine: e.target.checked })}
          />
        </OptionGroup>
        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        <TwoPane
          storageKey="case-converter"
          labelFirst="input"
          labelSecond={CASES.find((c) => c.id === state.primary)?.label ?? 'output'}
          input={
            <Panel label="Input" status={pluralize(lineCount, 'line')}>
              <CodeArea
                label="Identifiers or text to convert"
                value={state.input}
                onValueChange={(input) => patch({ input })}
                softWrap
                placeholder={
                  'Paste identifiers, one per line, or a sentence.\nTurn off "convert each line separately" to treat everything as one string.'
                }
              />
            </Panel>
          }
          output={
            <Panel
              label={CASES.find((c) => c.id === state.primary)?.label ?? 'Output'}
              actions={<CopyButton value={primaryResult} disabled={!primaryResult} />}
            >
              {!state.input ? (
                <EmptyState compact title="Nothing to convert yet" mark={<IconLayers size={24} />}>
                  Type or paste on the left, or load the Sample to see every case at once below.
                </EmptyState>
              ) : (
                <CodeArea
                  label="Primary conversion result"
                  value={primaryResult}
                  readOnly
                  softWrap
                />
              )}
            </Panel>
          }
        />

        {state.input && (
          <Panel label="All cases" status={pluralize(results.length, 'case')}>
            <ul className={styles.resultList}>
              {results.map(({ def, value }) => (
                <li key={def.id} className={styles.resultRow}>
                  <span className={styles.resultLabel} title={def.example}>
                    {def.label}
                  </span>
                  <code className={styles.resultValue} title={value}>
                    {value}
                  </code>
                  <CopyButton
                    value={value}
                    size="sm"
                    variant="ghost"
                    iconOnly
                    label={`Copy ${def.label}`}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PaneStack>
    </ToolShell>
  )
}
