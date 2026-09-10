import { useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, Select, SegmentedControl } from '@/components/Field'
import { IconDownload, IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import { downloadText } from '@/lib/download'
import { DIALECTS, formatSql, isSqlDialect, type KeywordCase, type SqlDialect } from './sql'

interface State {
  input: string
  dialect: SqlDialect
  keywordCase: KeywordCase
  indentWidth: number
  linesBetweenQueries: number
  minify: boolean
}

const DEFAULTS: State = {
  input: '',
  dialect: 'sql',
  keywordCase: 'upper',
  indentWidth: 2,
  linesBetweenQueries: 1,
  minify: false,
}

const isState = shapeValidator<State>({
  input: 'string',
  dialect: 'string',
  keywordCase: 'string',
  indentWidth: 'number',
  linesBetweenQueries: 'number',
  minify: 'boolean',
})

const SAMPLE = `select o.id, c.name, sum(oi.qty*oi.price) as total from orders o
join customers c on c.id=o.customer_id
join order_items oi on oi.order_id=o.id
where o.status='paid' and o.created_at >= '2026-01-01'
group by o.id,c.name having sum(oi.qty*oi.price) > 100
order by total desc limit 20;`

export default function SqlFormatterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const result = useMemo(
    () =>
      formatSql(state.input, {
        dialect: state.dialect,
        keywordCase: state.keywordCase,
        indentWidth: state.indentWidth,
        linesBetweenQueries: state.linesBetweenQueries,
        minify: state.minify,
      }),
    [
      state.input,
      state.dialect,
      state.keywordCase,
      state.indentWidth,
      state.linesBetweenQueries,
      state.minify,
    ],
  )

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
            onClick={() => downloadText('query.sql', result.ok ? result.output : '', 'text/plain')}
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
        <OptionGroup label="Dialect">
          <Select
            aria-label="SQL dialect"
            value={state.dialect}
            onChange={(e) => {
              const { value } = e.target
              if (isSqlDialect(value)) patch({ dialect: value })
            }}
          >
            {DIALECTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </Select>
        </OptionGroup>

        <OptionGroup label="Keywords">
          <SegmentedControl
            label="Keyword case"
            value={state.keywordCase}
            onChange={(keywordCase) => patch({ keywordCase })}
            options={[
              { value: 'upper', label: 'UPPER' },
              { value: 'lower', label: 'lower' },
              { value: 'preserve', label: 'As-is' },
            ]}
          />
        </OptionGroup>

        <OptionGroup label="Indent">
          <SegmentedControl
            label="Indent width"
            value={String(state.indentWidth)}
            onChange={(v) => patch({ indentWidth: Number(v) })}
            options={[
              { value: '2', label: '2' },
              { value: '4', label: '4' },
            ]}
          />
        </OptionGroup>

        <OptionGroup label="Between queries">
          <SegmentedControl
            label="Blank lines between queries"
            value={String(state.linesBetweenQueries)}
            onChange={(v) => patch({ linesBetweenQueries: Number(v) })}
            options={[
              { value: '0', label: '0' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
            ]}
          />
        </OptionGroup>

        <OptionGroup>
          <Checkbox
            label="Minify"
            checked={state.minify}
            onChange={(e) => patch({ minify: e.target.checked })}
          />
        </OptionGroup>

        <OptionSpacer />
      </OptionsBar>

      <TwoPane
        storageKey="sql-formatter"
        input={
          <Panel
            label="SQL"
            status={state.input ? pluralize(state.input.length, 'char') : undefined}
          >
            <CodeArea
              label="SQL to format"
              value={state.input}
              onValueChange={(input) => patch({ input })}
              lineNumbers
              acceptDrop
              placeholder="Paste a query here, or drop a .sql file."
            />
          </Panel>
        }
        output={
          <Panel
            label="Formatted"
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
          >
            {!result.ok ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <Callout tone="err" title="Could not format this query" live>
                  {result.error}
                </Callout>
              </div>
            ) : !state.input ? (
              <EmptyState compact title="Nothing to format yet" mark={<IconLayers size={24} />}>
                Paste a SQL query on the left, drop a .sql file onto it, or load the sample.
              </EmptyState>
            ) : (
              <CodeArea
                label="Result"
                value={result.output}
                readOnly
                lineNumbers={!state.minify}
                softWrap={state.minify}
              />
            )}
          </Panel>
        }
      />
    </ToolShell>
  )
}
