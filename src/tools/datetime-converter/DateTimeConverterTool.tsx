import { useId, useMemo } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Field, Select, SegmentedControl, TextInput } from '@/components/Field'
import { IconGlobe, IconPlus, IconTrash, IconX } from '@/components/Icon'
import { PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import {
  durationBetween,
  parseFlexible,
  toEpochMillis,
  toEpochSeconds,
  toHttpDate,
  toHumanString,
  toIso8601,
  toIsoWeekDate,
  toRfc2822,
  toRfc3339,
  toSqlDatetime,
  zoneSnapshot,
  type DateOnlyInterpretation,
} from './datetime'

interface State {
  input: string
  dateOnlyAs: DateOnlyInterpretation
  zone: string
  pinnedZones: string[]
  addZone: string
  durationFrom: string
  durationTo: string
}

const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// See the Unix Timestamp tool's UI for the same guard, kept as an
// independent copy here rather than a shared import, because a tool folder
// never imports from another tool folder (see docs/ARCHITECTURE.md §2).
const FALLBACK_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Sao_Paulo',
  'America/Mexico_City',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
  'Pacific/Honolulu',
]

function listZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone')
  } catch {
    /* fall through */
  }
  return FALLBACK_ZONES
}

const ZONES = listZones()
const SAMPLE_INPUT = '2026-03-15T14:30:00Z'

const DEFAULTS: State = {
  input: '',
  dateOnlyAs: 'zone',
  zone: LOCAL_ZONE,
  pinnedZones: [LOCAL_ZONE, 'UTC'],
  addZone: ZONES[0] ?? 'UTC',
  durationFrom: '',
  durationTo: '',
}

const isState = shapeValidator<State>({
  input: 'string',
  dateOnlyAs: 'string',
  zone: 'string',
  pinnedZones: 'string[]',
  addZone: 'string',
  durationFrom: 'string',
  durationTo: 'string',
})

/** A labelled, copyable readout row, the same pattern the hash and unix-timestamp tools use. */
function ResultRow({ label, value }: { label: string; value: string }) {
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
          width: '7.5rem',
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

export default function DateTimeConverterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const zoneFieldId = useId()
  const fromFieldId = useId()
  const toFieldId = useId()

  const parsed = useMemo(
    () =>
      state.input.trim()
        ? parseFlexible(state.input, { zone: state.zone, dateOnlyAs: state.dateOnlyAs })
        : undefined,
    [state.input, state.zone, state.dateOnlyAs],
  )

  const from = useMemo(
    () =>
      state.durationFrom.trim()
        ? parseFlexible(state.durationFrom, { zone: state.zone, dateOnlyAs: 'zone' })
        : undefined,
    [state.durationFrom, state.zone],
  )
  const to = useMemo(
    () =>
      state.durationTo.trim()
        ? parseFlexible(state.durationTo, { zone: state.zone, dateOnlyAs: 'zone' })
        : undefined,
    [state.durationTo, state.zone],
  )
  const duration = from?.ok && to?.ok ? durationBetween(from.date, to.date) : undefined

  const addZone = (zone: string) => {
    if (!zone || state.pinnedZones.includes(zone)) return
    patch({ pinnedZones: [...state.pinnedZones, zone] })
  }
  const removeZone = (zone: string) =>
    patch({ pinnedZones: state.pinnedZones.filter((z) => z !== zone) })

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => patch({ input: SAMPLE_INPUT })}>
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
      <PaneStack>
        {/* -------------------------------------------------------------- input */}
        <Panel label="One moment">
          <div
            style={{
              padding: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-3)',
            }}
          >
            <TextInput
              mono
              value={state.input}
              onChange={(e) => patch({ input: e.target.value })}
              placeholder='ISO 8601, RFC 2822, a plain date, an epoch number, or "now"'
              aria-label="Date/time to convert"
            />

            {!state.input.trim() ? (
              <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
                Type a date or time above in almost any common shape. A bare date like{' '}
                <code>2026-03-15</code> is genuinely ambiguous, the toggle that appears will let you
                say which midnight you meant.
              </p>
            ) : !parsed?.ok ? (
              <Callout tone="err" title="Cannot parse this input" live>
                {parsed?.error}
              </Callout>
            ) : (
              <>
                {parsed.dateOnly && (
                  <Callout tone="info" title="This date has no time, which midnight did you mean?">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-3)',
                        marginTop: 'var(--sp-2)',
                      }}
                    >
                      <SegmentedControl
                        label="Interpret the bare date as"
                        value={state.dateOnlyAs}
                        onChange={(dateOnlyAs) => patch({ dateOnlyAs })}
                        options={[
                          {
                            value: 'utc',
                            label: 'UTC midnight',
                            title: "new Date('2026-03-15') behaviour",
                          },
                          {
                            value: 'zone',
                            label: `Midnight in ${state.zone}`,
                            title: "new Date('2026-03-15T00:00') behaviour",
                          },
                        ]}
                      />
                    </div>
                  </Callout>
                )}

                <div
                  style={{
                    border: 'var(--hairline) solid var(--line)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  <ResultRow label="ISO 8601" value={toIso8601(parsed.date)} />
                  <ResultRow label="ISO 8601 (no ms)" value={toIso8601(parsed.date, false)} />
                  <ResultRow label="RFC 2822" value={toRfc2822(parsed.date)} />
                  <ResultRow label="RFC 3339" value={toRfc3339(parsed.date)} />
                  <ResultRow label="HTTP date" value={toHttpDate(parsed.date)} />
                  <ResultRow label="SQL datetime" value={toSqlDatetime(parsed.date, 'UTC')} />
                  <ResultRow label="Epoch seconds" value={toEpochSeconds(parsed.date)} />
                  <ResultRow label="Epoch millis" value={toEpochMillis(parsed.date)} />
                  <ResultRow label="Human" value={toHumanString(parsed.date, state.zone)} />
                  <ResultRow label="ISO week date" value={toIsoWeekDate(parsed.date, state.zone)} />
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* --------------------------------------------------------- zone table */}
        <Panel label="Across time zones" status={`${state.pinnedZones.length} pinned`}>
          <div
            style={{
              padding: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-3)',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-2)',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <Field label="Add a zone" htmlFor={zoneFieldId}>
                <Select
                  id={zoneFieldId}
                  value={state.addZone}
                  onChange={(e) => patch({ addZone: e.target.value })}
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" variant="secondary" onClick={() => addZone(state.addZone)}>
                <IconPlus size={13} />
                Pin
              </Button>
            </div>

            {parsed?.ok ? (
              <div
                style={{
                  border: 'var(--hairline) solid var(--line)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                {state.pinnedZones.map((zone) => {
                  const snap = zoneSnapshot(parsed.date, zone)
                  return (
                    <div
                      key={zone}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-3)',
                        padding: 'var(--sp-2) var(--sp-3)',
                        borderBottom: 'var(--hairline) solid var(--line-faint)',
                      }}
                    >
                      <IconGlobe size={13} />
                      <span
                        style={{
                          width: '11rem',
                          flexShrink: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                        }}
                      >
                        {zone}
                      </span>
                      <code
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-sm)',
                        }}
                      >
                        {snap.formatted}
                      </code>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--fg-subtle)',
                        }}
                      >
                        {snap.offset}
                      </span>
                      {snap.isDst && (
                        <span
                          title="Currently observing daylight saving time"
                          style={{
                            fontSize: 'var(--text-2xs)',
                            fontFamily: 'var(--font-mono)',
                            padding: '0 var(--sp-1)',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--warn-quiet)',
                            color: 'var(--warn)',
                          }}
                        >
                          DST
                        </span>
                      )}
                      <CopyButton value={snap.formatted} iconOnly label={`Copy time in ${zone}`} />
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={`Unpin ${zone}`}
                        onClick={() => removeZone(zone)}
                      >
                        <IconX size={12} />
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
                Enter a moment above to see it rendered in every pinned zone.
              </p>
            )}
          </div>
        </Panel>

        {/* ------------------------------------------------------------ duration */}
        <Panel label="Duration between two moments">
          <div
            style={{
              padding: 'var(--sp-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--sp-3)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <Field
                label="From"
                htmlFor={fromFieldId}
                error={from && !from.ok ? from.error : undefined}
              >
                <TextInput
                  id={fromFieldId}
                  mono
                  value={state.durationFrom}
                  onChange={(e) => patch({ durationFrom: e.target.value })}
                  placeholder="2026-01-01"
                />
              </Field>
              <Field label="To" htmlFor={toFieldId} error={to && !to.ok ? to.error : undefined}>
                <TextInput
                  id={toFieldId}
                  mono
                  value={state.durationTo}
                  onChange={(e) => patch({ durationTo: e.target.value })}
                  placeholder="now"
                />
              </Field>
            </div>

            {duration && (
              <>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)' }}>
                  {duration.negative && 'minus '}
                  {duration.years > 0 && `${duration.years}y `}
                  {duration.months > 0 && `${duration.months}mo `}
                  {duration.days}d {duration.hours}h {duration.minutes}m {duration.seconds}s
                </p>
                <div
                  style={{
                    border: 'var(--hairline) solid var(--line)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  <ResultRow label="Total days" value={duration.totalDays.toString()} />
                  <ResultRow label="Total hours" value={duration.totalHours.toString()} />
                  <ResultRow label="Total minutes" value={duration.totalMinutes.toString()} />
                  <ResultRow label="Total seconds" value={duration.totalSeconds.toString()} />
                </div>
              </>
            )}
          </div>
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}
