import { useEffect, useId, useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { Field, Select, SegmentedControl, TextInput } from '@/components/Field'
import { IconClock, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import {
  UNITS,
  dayOfWeek,
  detectUnit,
  formatInZone,
  formatRelative,
  fromDate,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
  toInstant,
  toIso8601,
  toRfc2822,
  toRfc3339,
  zonedTimeToUtc,
  type TimestampUnit,
} from './epoch'

interface State {
  input: string
  unitOverride: TimestampUnit | 'auto'
  dtLocal: string
  zone: string
}

/**
 * A real moment worth recognising: 2001-09-09T01:46:40Z, when Unix time first
 * showed ten digits and every log file in the world got one character wider.
 */
const SAMPLE_TIMESTAMP = '1000000000'

/** The browser's own zone, used as the "Local" row and the picker's default. */
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// A small curated fallback for browsers without `Intl.supportedValuesOf`
// (Firefox before 113, Safari before 17). Full coverage isn't the point,
// covering the zones someone actually reaches for is.
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

const DEFAULTS: State = {
  input: '',
  unitOverride: 'auto',
  dtLocal: '',
  zone: LOCAL_ZONE,
}

const isState = shapeValidator<State>({
  input: 'string',
  unitOverride: 'string',
  dtLocal: 'string',
  zone: 'string',
})

const UNIT_LABEL: Record<TimestampUnit, string> = {
  seconds: 's',
  milliseconds: 'ms',
  microseconds: 'µs',
  nanoseconds: 'ns',
}

/** A labelled, copyable readout row. Matches the pattern used by the hash tool's digest list. */
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
          width: '6rem',
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

export default function UnixTimestampTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  const dtFieldId = useId()
  const zoneFieldId = useId()

  // The live "now" readout. Plain state, not shared: it is a clock, not a
  // value to encode into a link. Paused stops the tick without losing the
  // frozen instant, so a user comparing against "now" can hold it still.
  const [now, setNow] = useState(() => new Date())
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [paused])

  const effectiveUnit: TimestampUnit =
    state.unitOverride === 'auto' ? detectUnit(state.input) : state.unitOverride
  const parsed = useMemo(
    () => (state.input.trim() ? toInstant(state.input, effectiveUnit) : undefined),
    [state.input, effectiveUnit],
  )

  const parsedFields = parseDatetimeLocalValue(state.dtLocal)
  const fromPicker = parsedFields ? zonedTimeToUtc(parsedFields, state.zone) : undefined
  // `now` comes from the tick, so it is always valid; the fallback exists only
  // to keep the type honest without an assertion.
  const nowEpochs = fromDate(now) ?? {
    seconds: '0',
    milliseconds: '0',
    microseconds: '0',
    nanoseconds: '0',
  }
  const pickerEpochs = fromPicker ? (fromDate(fromPicker) ?? undefined) : undefined

  return (
    <ToolShell
      actions={
        <>
          {/* A fixed moment rather than "now": a sample that changes every time
              you press it teaches nothing about what the tool does. */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: SAMPLE_TIMESTAMP, unitOverride: 'auto' })}
          >
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: '', dtLocal: '' })}
            disabled={!state.input && !state.dtLocal}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <Panel label="Now" status={paused ? 'paused' : 'live'}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-3)',
            padding: 'var(--sp-3)',
            flexWrap: 'wrap',
          }}
        >
          <IconClock size={16} />
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-md)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatInZone(now, LOCAL_ZONE)}
          </code>
          <code
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--fg-subtle)',
            }}
          >
            {nowEpochs.seconds}s · {nowEpochs.milliseconds}ms
          </code>
          <OptionSpacer />
          <Button size="sm" variant="ghost" pressed={paused} onClick={() => setPaused((v) => !v)}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: nowEpochs.seconds, unitOverride: 'seconds' })}
          >
            Snap top to now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ dtLocal: toDatetimeLocalValue(now, state.zone) })}
          >
            Snap bottom to now
          </Button>
        </div>
      </Panel>

      <PaneStack>
        {/* -------------------------------------------------- timestamp -> instant */}
        <Panel label="Timestamp → instant">
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
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 'var(--sp-3) var(--sp-4)',
              }}
            >
              <OptionGroup label="Timestamp">
                <TextInput
                  mono
                  value={state.input}
                  onChange={(e) => patch({ input: e.target.value })}
                  placeholder="1700000000"
                  style={{ width: '16rem' }}
                  aria-label="Timestamp to convert"
                />
              </OptionGroup>
              <OptionGroup label="Unit">
                <SegmentedControl
                  label="Timestamp unit"
                  value={state.unitOverride}
                  onChange={(unitOverride) => patch({ unitOverride })}
                  options={[
                    {
                      value: 'auto',
                      label: `Auto (${UNIT_LABEL[effectiveUnit]})`,
                      title: 'Detected from the number of digits',
                    },
                    ...UNITS.map((u) => ({ value: u, label: UNIT_LABEL[u] })),
                  ]}
                />
              </OptionGroup>
            </div>

            {!state.input.trim() ? (
              <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
                Type an epoch timestamp above, seconds, milliseconds, microseconds, or nanoseconds,
                positive or negative. The unit is guessed from its magnitude; override it if the
                guess is wrong.
              </p>
            ) : !parsed?.ok ? (
              <Callout tone="err" title="Cannot parse this timestamp" live>
                {parsed?.error}
              </Callout>
            ) : (
              <>
                {parsed.near2038 && (
                  <Callout tone="warn" title="Near the 2038 rollover">
                    This instant is within 90 days of 2038-01-19T03:14:07Z, the moment a signed
                    32-bit seconds counter overflows. Systems still storing time as a C `time_t` on
                    a 32-bit build will wrap to a negative value there.
                  </Callout>
                )}
                <div
                  style={{
                    border: 'var(--hairline) solid var(--line)',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                  }}
                >
                  <ResultRow label="Local" value={formatInZone(parsed.date!, LOCAL_ZONE)} />
                  <ResultRow label="UTC" value={formatInZone(parsed.date!, 'UTC')} />
                  <ResultRow label="ISO 8601" value={toIso8601(parsed.date!)} />
                  <ResultRow label="RFC 2822" value={toRfc2822(parsed.date!)} />
                  <ResultRow label="RFC 3339" value={toRfc3339(parsed.date!)} />
                  <ResultRow label="Relative" value={formatRelative(parsed.date!, now)} />
                  <ResultRow label="Weekday" value={dayOfWeek(parsed.date!, LOCAL_ZONE)} />
                </div>
              </>
            )}
          </div>
        </Panel>

        {/* -------------------------------------------------- instant -> timestamp */}
        <Panel label="Instant → timestamp">
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
                gap: 'var(--sp-3)',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <Field label="Date & time" htmlFor={dtFieldId}>
                <TextInput
                  id={dtFieldId}
                  type="datetime-local"
                  step={1}
                  value={state.dtLocal}
                  onChange={(e) => patch({ dtLocal: e.target.value })}
                />
              </Field>
              <Field label="Time zone" htmlFor={zoneFieldId}>
                <Select
                  id={zoneFieldId}
                  value={state.zone}
                  onChange={(e) => patch({ zone: e.target.value })}
                >
                  {ZONES.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {!parsedFields ? (
              <p style={{ color: 'var(--fg-subtle)', fontSize: 'var(--text-sm)' }}>
                Pick a date and time above, using your browser's own date/time control, interpreted
                in the time zone you choose, to get its epoch value in every unit.
              </p>
            ) : (
              <div
                style={{
                  border: 'var(--hairline) solid var(--line)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                }}
              >
                <ResultRow label="Seconds" value={pickerEpochs!.seconds} />
                <ResultRow label="Millis" value={pickerEpochs!.milliseconds} />
                <ResultRow label="Micros" value={pickerEpochs!.microseconds} />
                <ResultRow label="Nanos" value={pickerEpochs!.nanoseconds} />
              </div>
            )}
          </div>
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}
