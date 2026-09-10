import { useMemo, useRef } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl, TextInput } from '@/components/Field'
import { IconClock, IconTrash, IconWarning } from '@/components/Icon'
import { PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { pluralize } from '@/lib/format'
import { MACROS, describeCron, explainFields, nextRuns, parseCron } from './cron'
import { formatRelative } from './relative'
import { labelCronTokens, tokenizeCronInput } from './ruler'
import { cx } from '@/lib/cx'
import styles from './CronHelperTool.module.css'

interface State {
  expression: string
  utc: boolean
}

const DEFAULTS: State = { expression: '', utc: false }

const isState = shapeValidator<State>({
  expression: 'string',
  utc: 'boolean',
})

const SAMPLE = '0 9 * * 1-5'

// The macro table plus about ten expressions people actually reach for.
// Macros come first (they are the standard's own vocabulary); the rest are
// ordinary schedules that don't have a one-word name.
const PRESETS: Array<{ label: string; expression: string }> = [
  ...Object.entries(MACROS).map(([name, macro]) => ({ label: name, expression: macro.expression })),
  { label: 'Every weekday at 9am', expression: '0 9 * * 1-5' },
  { label: 'Every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every 15 minutes', expression: '*/15 * * * *' },
  { label: 'Every 6 hours', expression: '0 */6 * * *' },
  { label: 'First of the month at midnight', expression: '0 0 1 * *' },
  { label: 'Every day at 6:30am', expression: '30 6 * * *' },
  { label: 'Every Monday at 8am', expression: '0 8 * * 1' },
  { label: 'Twice a day (midnight and noon)', expression: '0 0,12 * * *' },
  { label: 'Business hours, every 15 minutes', expression: '0,15,30,45 9-17 * * 1-5' },
  { label: 'Christmas morning at 9am', expression: '0 9 25 12 *' },
]

export default function CronHelperTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const parsed = useMemo(() => parseCron(state.expression), [state.expression])
  const labelled = useMemo(
    () => labelCronTokens(tokenizeCronInput(state.expression)),
    [state.expression],
  )

  // Clicking a ruler cell selects that field in the input, which turns the
  // diagram into a way to edit as well as a way to read.
  const inputRef = useRef<HTMLInputElement | null>(null)
  const selectField = (start: number, end: number) => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(start, end)
  }

  const runsResult = useMemo(() => {
    if (!parsed.ok) return undefined
    return nextRuns(parsed.expression, new Date(), 10, state.utc)
  }, [parsed, state.utc])

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => patch({ expression: SAMPLE })}>
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ expression: '' })}
            disabled={!state.expression}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <PaneStack>
        <Panel
          label="Expression"
          actions={<CopyButton value={state.expression} disabled={!state.expression} />}
        >
          <div className={styles.expression}>
            <TextInput
              ref={inputRef}
              mono
              className={styles.input}
              value={state.expression}
              onChange={(e) => patch({ expression: e.target.value })}
              placeholder="0 9 * * 1-5"
              aria-label="Cron expression"
              invalid={Boolean(state.expression.trim()) && !parsed.ok}
            />

            {/* The field ruler. Clicking a cell selects that field's text in
                the input, so the diagram is a way to edit as well as read. */}
            {labelled.length > 0 && (
              <div className={styles.ruler}>
                {labelled.map((token, i) => {
                  const errored = !parsed.ok && parsed.error.fieldIndex === i
                  return (
                    <button
                      type="button"
                      key={`${token.field}-${i}`}
                      className={cx(styles.cell, errored && styles.cellError)}
                      title={`Select the ${token.field} field${errored ? ', invalid' : ''}`}
                      onClick={() => selectField(token.start, token.end)}
                    >
                      <span className={styles.cellLabel}>
                        {/* The error tone on this cell was colour-only, a
                            colourblind user had no way to tell it apart from
                            a valid field. The icon carries the same
                            information as a shape, not just a hue. */}
                        {errored && <IconWarning size={10} className={styles.cellErrorIcon} />}
                        {token.field}
                      </span>
                      <span className={styles.cellToken}>{token.text}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {!state.expression.trim() ? (
              <EmptyState compact title="Nothing to schedule yet" mark={<IconClock size={24} />}>
                Type a cron expression above, five fields, six with a leading seconds column, or a
                macro like <code>@daily</code>, or pick a preset below to see it explained in plain
                English with its next ten run times.
              </EmptyState>
            ) : !parsed.ok ? (
              <Callout tone="err" title="Cannot parse this expression" live>
                {parsed.error.message}
              </Callout>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-2)' }}>
                {/* Not `live`: this recomputes on every keystroke while the
                    expression stays parseable, so announcing it every time
                    would be the over-announce anti-pattern, not a
                    screen-reader courtesy. The error branch above stays
                    live. That is a real state transition, not a
                    per-keystroke redraw. */}
                <Callout
                  tone="info"
                  title={describeCron(parsed.expression)}
                  className={styles.descriptionCallout}
                />
                <CopyButton
                  value={describeCron(parsed.expression)}
                  iconOnly
                  label="Copy description"
                />
              </div>
            )}
          </div>
        </Panel>

        {parsed.ok && (
          <>
            <Panel label="Fields">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {explainFields(parsed.expression).map((row) => (
                  <div
                    key={row.field}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 'var(--sp-3)',
                      padding: 'var(--sp-2) var(--sp-3)',
                      borderBottom: 'var(--hairline) solid var(--line-faint)',
                    }}
                  >
                    <span
                      style={{
                        width: '7.5rem',
                        flexShrink: 0,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--fg-muted)',
                      }}
                    >
                      {row.field}
                    </span>
                    <code
                      style={{
                        width: '5rem',
                        flexShrink: 0,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--accent)',
                      }}
                    >
                      {row.raw}
                    </code>
                    <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0 }}>
                      {row.meaning}
                    </span>
                    <CopyButton
                      value={row.meaning}
                      size="sm"
                      variant="ghost"
                      iconOnly
                      label={`Copy ${row.field} meaning`}
                    />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              label="Next runs"
              actions={
                <SegmentedControl
                  label="Time zone for next runs"
                  value={state.utc ? 'utc' : 'local'}
                  onChange={(v) => patch({ utc: v === 'utc' })}
                  options={[
                    { value: 'local', label: 'Local' },
                    { value: 'utc', label: 'UTC' },
                  ]}
                />
              }
            >
              {!runsResult || runsResult.runs.length === 0 ? (
                <div style={{ padding: 'var(--sp-3)' }}>
                  <Callout tone="warn" title="This expression may never fire">
                    No matching instant was found within five years of now. A schedule like{' '}
                    <code>0 0 30 2 *</code> (30 February) is syntactically valid but describes a
                    date that never occurs.
                  </Callout>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {runsResult.runs.map((run, i) => {
                      const weekday = new Intl.DateTimeFormat('en-US', {
                        weekday: 'short',
                        timeZone: state.utc ? 'UTC' : undefined,
                      }).format(run)
                      const absolute = new Intl.DateTimeFormat('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                        timeZone: state.utc ? 'UTC' : undefined,
                      }).format(run)
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--sp-3)',
                            padding: 'var(--sp-2) var(--sp-3)',
                            borderBottom: 'var(--hairline) solid var(--line-faint)',
                          }}
                        >
                          <IconClock size={13} />
                          <span
                            style={{
                              width: '3rem',
                              flexShrink: 0,
                              fontSize: 'var(--text-xs)',
                              color: 'var(--fg-muted)',
                            }}
                          >
                            {weekday}
                          </span>
                          <code
                            style={{
                              flex: 1,
                              minWidth: 0,
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--text-sm)',
                            }}
                          >
                            {absolute}
                          </code>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--fg-subtle)' }}>
                            {formatRelative(run, new Date())}
                          </span>
                          <CopyButton
                            value={absolute}
                            size="sm"
                            variant="ghost"
                            iconOnly
                            label="Copy run time"
                          />
                        </div>
                      )
                    })}
                  </div>
                  {runsResult.exhausted && (
                    <div style={{ padding: 'var(--sp-3)' }}>
                      <Callout
                        tone="warn"
                        title={`Only ${pluralize(runsResult.runs.length, 'run')} found in the next 5 years`}
                      >
                        This expression fires rarely enough that fewer than 10 upcoming runs exist
                        within a five-year search horizon.
                      </Callout>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </>
        )}

        <Panel label="Presets">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--sp-2)',
              padding: 'var(--sp-3)',
            }}
          >
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="secondary"
                onClick={() => patch({ expression: preset.expression })}
                title={preset.expression}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}
