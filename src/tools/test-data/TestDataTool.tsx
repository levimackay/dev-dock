import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Checkbox, Field, Select, SegmentedControl, TextInput } from '@/components/Field'
import { IconDownload, IconPlus, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { numberBetween, oneOf, shapeValidator, useShareState } from '@/tools/useShareState'
import { downloadText } from '@/lib/download'
import { pluralize } from '@/lib/format'
import styles from './TestDataTool.module.css'
import {
  MAX_ROWS,
  generateLorem,
  generateRecords,
  toCsv,
  toJson,
  toJsonLines,
  toSqlInserts,
  toTsInterface,
  toTsv,
  type FieldSchema,
  type FieldType,
  type LoremUnit,
} from './generate'

type Mode = 'lorem' | 'records'
type OutputFormat = 'json' | 'jsonl' | 'csv' | 'tsv' | 'sql' | 'ts'

interface State {
  mode: Mode
  loremUnit: LoremUnit
  loremCount: number
  loremSeed: string
  loremStartWithLorem: boolean
  recordsCount: number
  recordsSeed: string
  fieldsJson: string
  outputFormat: OutputFormat
  tableName: string
  interfaceName: string
}

const DEFAULT_FIELDS: FieldSchema[] = [
  { name: 'id', type: 'autoIncrement', min: 1 },
  { name: 'name', type: 'fullName' },
  { name: 'email', type: 'email' },
  { name: 'signedUpAt', type: 'date', dateStart: '2022-01-01', dateEnd: '2026-01-01' },
]

const DEFAULTS: State = {
  mode: 'records',
  loremUnit: 'paragraphs',
  loremCount: 3,
  loremSeed: 'dev-dock',
  loremStartWithLorem: true,
  recordsCount: 20,
  recordsSeed: 'dev-dock',
  fieldsJson: JSON.stringify(DEFAULT_FIELDS),
  outputFormat: 'json',
  tableName: 'users',
  interfaceName: 'Row',
}

const isState = shapeValidator<State>({
  mode: oneOf('lorem', 'records'),
  loremUnit: oneOf('words', 'sentences', 'paragraphs', 'listItems', 'bytes'),
  loremCount: numberBetween(1, 100_000),
  loremSeed: 'string',
  loremStartWithLorem: 'boolean',
  recordsCount: numberBetween(1, MAX_ROWS),
  recordsSeed: 'string',
  fieldsJson: 'string',
  outputFormat: oneOf('json', 'jsonl', 'csv', 'tsv', 'sql', 'ts'),
  tableName: 'string',
  interfaceName: 'string',
})

/** Untrusted: it round-trips through a share link. Anything that does not
 *  look like a field-schema array is dropped rather than half-trusted. */
function parseFields(json: string): FieldSchema[] {
  try {
    const value: unknown = JSON.parse(json)
    if (!Array.isArray(value)) return []
    return value.filter(
      (f): f is FieldSchema =>
        typeof f === 'object' &&
        f !== null &&
        typeof (f as FieldSchema).name === 'string' &&
        typeof (f as FieldSchema).type === 'string',
    )
  } catch {
    return []
  }
}

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'fullName', label: 'Full name' },
  { value: 'email', label: 'Email' },
  { value: 'username', label: 'Username' },
  { value: 'phone', label: 'Phone' },
  { value: 'street', label: 'Street address' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State / region' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'country', label: 'Country' },
  { value: 'company', label: 'Company' },
  { value: 'jobTitle', label: 'Job title' },
  { value: 'sentence', label: 'Sentence' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'integer', label: 'Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date + time' },
  { value: 'uuid', label: 'UUID' },
  { value: 'ipAddress', label: 'IP address' },
  { value: 'url', label: 'URL' },
  { value: 'hexColor', label: 'Hex colour' },
  { value: 'enum', label: 'Enum (custom list)' },
  { value: 'autoIncrement', label: 'Auto-increment ID' },
]

const LOREM_UNITS: Array<{ value: LoremUnit; label: string }> = [
  { value: 'words', label: 'Words' },
  { value: 'sentences', label: 'Sentences' },
  { value: 'paragraphs', label: 'Paragraphs' },
  { value: 'listItems', label: 'List items' },
  { value: 'bytes', label: 'Bytes' },
]

const OUTPUT_FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'json', label: 'JSON' },
  { value: 'jsonl', label: 'JSON Lines' },
  { value: 'csv', label: 'CSV' },
  { value: 'tsv', label: 'TSV' },
  { value: 'sql', label: 'SQL' },
  { value: 'ts', label: 'TypeScript' },
]

const FORMAT_FILE: Record<OutputFormat, { ext: string; mime: string }> = {
  json: { ext: 'json', mime: 'application/json' },
  jsonl: { ext: 'jsonl', mime: 'text/plain' },
  csv: { ext: 'csv', mime: 'text/csv' },
  tsv: { ext: 'tsv', mime: 'text/plain' },
  sql: { ext: 'sql', mime: 'text/plain' },
  ts: { ext: 'ts', mime: 'text/plain' },
}

export default function TestDataTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const fields = useMemo(() => parseFields(state.fieldsJson), [state.fieldsJson])
  const setFields = (next: FieldSchema[]) => patch({ fieldsJson: JSON.stringify(next) })

  const loremOutput = useMemo(
    () =>
      generateLorem({
        unit: state.loremUnit,
        count: state.loremCount,
        seed: state.loremSeed,
        startWithLorem: state.loremStartWithLorem,
      }),
    [state.loremUnit, state.loremCount, state.loremSeed, state.loremStartWithLorem],
  )

  const rows = useMemo(
    () => generateRecords(fields, state.recordsCount, state.recordsSeed),
    [fields, state.recordsCount, state.recordsSeed],
  )

  const recordsOutput = useMemo(() => {
    switch (state.outputFormat) {
      case 'json':
        return toJson(rows)
      case 'jsonl':
        return toJsonLines(rows)
      case 'csv':
        return toCsv(rows, fields)
      case 'tsv':
        return toTsv(rows, fields)
      case 'sql':
        return toSqlInserts(rows, fields, state.tableName)
      case 'ts':
        return toTsInterface(fields, state.interfaceName)
      default:
        // Unreachable while the validator holds, and cheap insurance if a
        // format is added to the union without a case here. Falling off the end
        // of this switch used to return `undefined` from a function typed
        // `string`, which TypeScript cannot catch across an exhaustive-looking
        // switch on a value that arrived from a URL.
        return toJson(rows)
    }
  }, [rows, fields, state.outputFormat, state.tableName, state.interfaceName])

  const output = state.mode === 'lorem' ? loremOutput : recordsOutput

  const loadSample = () => {
    setState(DEFAULTS)
  }

  const addField = () => {
    setFields([...fields, { name: `field${fields.length + 1}`, type: 'sentence' }])
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  const updateField = (index: number, patchField: Partial<FieldSchema>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...patchField } : f)))
  }

  const download = () => {
    if (state.mode === 'lorem') {
      downloadText('lorem.txt', loremOutput, 'text/plain')
      return
    }
    const { ext, mime } = FORMAT_FILE[state.outputFormat]
    downloadText(`test-data.${ext}`, recordsOutput, mime)
  }

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={loadSample}>
            Sample
          </Button>
          <Button size="sm" variant="ghost" onClick={download} disabled={!output}>
            <IconDownload size={13} />
            Download
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
              { value: 'lorem', label: 'Lorem' },
              { value: 'records', label: 'Records' },
            ]}
          />
        </OptionGroup>
        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        {state.mode === 'lorem' ? (
          <Panel label="Lorem options" bodyClassName={styles.section}>
            <div className={styles.row}>
              <SegmentedControl
                label="Unit"
                value={state.loremUnit}
                onChange={(loremUnit) => patch({ loremUnit })}
                options={LOREM_UNITS}
              />
              <Field label="Count" inline>
                <TextInput
                  type="number"
                  min={0}
                  max={2000}
                  mono
                  className={styles.optInput}
                  value={state.loremCount}
                  onChange={(e) => patch({ loremCount: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Seed" inline hint="Same seed, same output, every time.">
                <TextInput
                  mono
                  className={styles.optInputWide}
                  value={state.loremSeed}
                  onChange={(e) => patch({ loremSeed: e.target.value })}
                />
              </Field>
              <Checkbox
                label={'Start with "Lorem ipsum dolor sit amet"'}
                checked={state.loremStartWithLorem}
                onChange={(e) => patch({ loremStartWithLorem: e.target.checked })}
              />
            </div>
          </Panel>
        ) : (
          <>
            <Panel
              label="Schema"
              status={pluralize(fields.length, 'field')}
              actions={
                <Button size="sm" variant="ghost" onClick={addField}>
                  <IconPlus size={13} />
                  Add field
                </Button>
              }
            >
              {fields.length === 0 ? (
                <div style={{ padding: 'var(--sp-3)' }}>
                  <Callout tone="info">Add a field to start building a schema.</Callout>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Type</th>
                        <th scope="col">Options</th>
                        <th scope="col">
                          <span className="visually-hidden">Remove</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field, i) => (
                        <FieldRow
                          key={i}
                          field={field}
                          index={i}
                          onChange={(p) => updateField(i, p)}
                          onRemove={() => removeField(i)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>

            <Panel label="Generate" bodyClassName={styles.section}>
              <div className={styles.row}>
                <Field label="Row count" inline>
                  <TextInput
                    type="number"
                    min={0}
                    max={MAX_ROWS}
                    mono
                    className={styles.optInput}
                    value={state.recordsCount}
                    onChange={(e) => patch({ recordsCount: Number(e.target.value) || 0 })}
                  />
                </Field>
                <Field
                  label="Seed"
                  inline
                  hint="Same seed, same rows, a failing test that regenerates differently every run is not a failing test."
                >
                  <TextInput
                    mono
                    className={styles.optInputWide}
                    value={state.recordsSeed}
                    onChange={(e) => patch({ recordsSeed: e.target.value })}
                  />
                </Field>
                <SegmentedControl
                  label="Output format"
                  value={state.outputFormat}
                  onChange={(outputFormat) => patch({ outputFormat })}
                  options={OUTPUT_FORMATS}
                />
                {state.outputFormat === 'sql' && (
                  <Field label="Table name" inline>
                    <TextInput
                      mono
                      className={styles.optInputWide}
                      value={state.tableName}
                      onChange={(e) => patch({ tableName: e.target.value })}
                    />
                  </Field>
                )}
                {state.outputFormat === 'ts' && (
                  <Field label="Interface name" inline>
                    <TextInput
                      mono
                      className={styles.optInputWide}
                      value={state.interfaceName}
                      onChange={(e) => patch({ interfaceName: e.target.value })}
                    />
                  </Field>
                )}
              </div>
              {state.recordsCount > MAX_ROWS && (
                <Callout tone="warn">
                  Capped at {pluralize(MAX_ROWS, 'row')} to keep the tab responsive,{' '}
                  {pluralize(state.recordsCount, 'row')} was requested.
                </Callout>
              )}
            </Panel>
          </>
        )}

        <Panel
          label="Output"
          status={state.mode === 'records' ? pluralize(rows.length, 'row') : undefined}
          actions={<CopyButton value={output} label="Copy" disabled={!output} />}
        >
          {!output ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <Callout tone="info">
                Nothing to generate yet, add a field or raise the count above.
              </Callout>
            </div>
          ) : (
            <CodeArea
              label="Generated output"
              value={output}
              readOnly
              softWrap={state.mode === 'lorem'}
              lineNumbers={state.mode !== 'lorem'}
            />
          )}
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}

function FieldRow({
  field,
  index,
  onChange,
  onRemove,
}: {
  field: FieldSchema
  index: number
  onChange: (patch: Partial<FieldSchema>) => void
  onRemove: () => void
}) {
  return (
    <tr>
      <td>
        <TextInput
          mono
          className={styles.nameInput}
          aria-label={`Field ${index + 1} name`}
          value={field.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </td>
      <td>
        <Select
          className={styles.typeSelect}
          aria-label={`Field ${index + 1} type`}
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </td>
      <td>
        <div className={styles.optCell}>
          {(field.type === 'integer' || field.type === 'decimal') && (
            <>
              <TextInput
                type="number"
                mono
                className={styles.optInput}
                aria-label={`Field ${index + 1} minimum`}
                placeholder="min"
                value={field.min ?? ''}
                onChange={(e) =>
                  onChange({ min: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
              <TextInput
                type="number"
                mono
                className={styles.optInput}
                aria-label={`Field ${index + 1} maximum`}
                placeholder="max"
                value={field.max ?? ''}
                onChange={(e) =>
                  onChange({ max: e.target.value === '' ? undefined : Number(e.target.value) })
                }
              />
            </>
          )}
          {field.type === 'decimal' && (
            <TextInput
              type="number"
              mono
              className={styles.optInput}
              aria-label={`Field ${index + 1} decimal places`}
              placeholder="decimals"
              value={field.decimals ?? ''}
              onChange={(e) =>
                onChange({ decimals: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          )}
          {field.type === 'autoIncrement' && (
            <TextInput
              type="number"
              mono
              className={styles.optInput}
              aria-label={`Field ${index + 1} starting value`}
              placeholder="start"
              value={field.min ?? 1}
              onChange={(e) => onChange({ min: Number(e.target.value) || 1 })}
            />
          )}
          {(field.type === 'date' || field.type === 'datetime') && (
            <>
              <TextInput
                type="date"
                mono
                className={styles.optInputWide}
                aria-label={`Field ${index + 1} earliest date`}
                value={field.dateStart ?? ''}
                onChange={(e) => onChange({ dateStart: e.target.value })}
              />
              <TextInput
                type="date"
                mono
                className={styles.optInputWide}
                aria-label={`Field ${index + 1} latest date`}
                value={field.dateEnd ?? ''}
                onChange={(e) => onChange({ dateEnd: e.target.value })}
              />
            </>
          )}
          {field.type === 'enum' && (
            <TextInput
              mono
              className={styles.optInputWide}
              aria-label={`Field ${index + 1} comma-separated values`}
              placeholder="value1, value2, value3"
              value={field.enumValues ?? ''}
              onChange={(e) => onChange({ enumValues: e.target.value })}
            />
          )}
        </div>
      </td>
      <td>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={`Remove field ${index + 1}`}
          onClick={onRemove}
        >
          <IconTrash size={13} />
        </Button>
      </td>
    </tr>
  )
}
