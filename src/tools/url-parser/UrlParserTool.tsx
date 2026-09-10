import { useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, TextInput } from '@/components/Field'
import { IconGlobe, IconPlus, IconTrash } from '@/components/Icon'
import { PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import styles from './UrlParserTool.module.css'
import {
  buildQueryString,
  decodeIdnHostname,
  isIdnHost,
  isIpAddress,
  isTrackingParam,
  naiveSuffix,
  parseFragmentParams,
  parseQueryParams,
  parseUrl,
  pathSegments,
  replaceQueryString,
  stripTrackingParams,
  trackingExplanation,
  type QueryParam,
} from './urlparts'

interface State {
  url: string
}

const DEFAULTS: State = { url: '' }
const isState = shapeValidator<State>({ url: 'string' })

const SAMPLE_URL =
  'https://shop.example.com:8443/products/running-shoes?utm_source=newsletter&utm_medium=email&gclid=Cj0KCQjw&color=blue&color=red&q=50%2520off#a=1&b=2'

export default function UrlParserTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  // The URL text is the single source of truth (and the only thing that ends
  // up in the share link). `params` is a working copy the table edits
  // directly, keeping it separate from re-deriving on every render is what
  // lets a per-row "don't encode this" toggle survive editing a *different*
  // row without being clobbered by a fresh parse of the URL it just helped
  // produce. Typing straight into the URL field clears it, so the table
  // falls back to whatever that new text actually parses to.
  const [params, setParams] = useState<QueryParam[] | null>(null)

  const result = parseUrl(state.url)
  const liveParams = params ?? (result.ok ? parseQueryParams(result.parts.search) : [])

  const setUrl = (url: string) => {
    patch({ url })
    setParams(null)
  }

  const commitParams = (next: QueryParam[]) => {
    setParams(next)
    if (!result.ok) return
    patch({ url: replaceQueryString(state.url, buildQueryString(next)) })
  }

  const updateRow = (index: number, patchRow: Partial<QueryParam>) => {
    commitParams(liveParams.map((p, i) => (i === index ? { ...p, ...patchRow } : p)))
  }

  const removeRow = (index: number) => {
    commitParams(liveParams.filter((_, i) => i !== index))
  }

  const addRow = () => {
    commitParams([
      ...liveParams,
      { key: '', value: '', rawValue: '', encode: true, flagOnly: false },
    ])
  }

  const moveRow = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= liveParams.length) return
    const next = liveParams.slice()
    const [row] = next.splice(index, 1)
    next.splice(target, 0, row!)
    commitParams(next)
  }

  const trackingCount = liveParams.filter((p) => isTrackingParam(p.key)).length

  const fragmentParams = result.ok ? parseFragmentParams(result.parts.hash) : null

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => setUrl(SAMPLE_URL)}>
            Sample
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setUrl('')} disabled={!state.url}>
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <Panel label="URL" bodyClassName={styles.section}>
        <TextInput
          mono
          aria-label="URL to parse"
          value={state.url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://user:pass@example.com:8443/path?query=1#hash"
        />
      </Panel>

      {!state.url ? (
        <Panel>
          <EmptyState compact title="Nothing to parse yet" mark={<IconGlobe size={24} />}>
            Paste a URL above, or load the Sample to see it broken into parts, an editable query
            table, and tracking-parameter detection all at once.
          </EmptyState>
        </Panel>
      ) : !result.ok ? (
        <Panel tone="err">
          <div style={{ padding: 'var(--sp-3)' }}>
            <Callout tone="err" title="Cannot parse this URL" live>
              {result.error}
            </Callout>
          </div>
        </Panel>
      ) : (
        <PaneStack>
          <Panel label="Parts" actions={<CopyButton value={result.parts.href} label="Copy href" />}>
            <div className={styles.section}>
              <div className={styles.partsGrid}>
                <PartRow label="protocol" value={result.parts.protocol} />
                <PartRow label="username" value={result.parts.username} />
                {/* Masked for display, but the copy button carries the real value: a
              button that copies six bullet characters is worse than no button.
              This is a URL the user pasted, in a tool for taking URLs apart. */}
          <PartRow
            label="password"
            value={result.parts.password}
            display={result.parts.password ? '••••••' : ''}
          />
                <PartRow label="host" value={result.parts.host} />
                <PartRow label="hostname" value={result.parts.hostname} />
                <PartRow label="port" value={result.parts.port} />
                <PartRow label="pathname" value={result.parts.pathname} />
                <PartRow label="search" value={result.parts.search} />
                <PartRow label="hash" value={result.parts.hash} />
                <PartRow label="origin" value={result.parts.origin} />
              </div>

              <div className={styles.badgeRow}>
                {isIpAddress(result.parts.hostname) && (
                  <span className={styles.badge}>IP address host</span>
                )}
                {naiveSuffix(result.parts.hostname) && (
                  <span
                    className={styles.badge}
                    title="Naive last-two-labels heuristic, not the real Public Suffix List"
                  >
                    suffix: {naiveSuffix(result.parts.hostname)}
                  </span>
                )}
                {isIdnHost(result.parts.hostname) && (
                  <span className={styles.badge + ' ' + styles.badgeWarn}>
                    IDN host, decodes to "{decodeIdnHostname(result.parts.hostname)}". Verify this
                    is the domain you expect; visually similar characters are a real phishing
                    technique.
                  </span>
                )}
              </div>
            </div>
          </Panel>

          {result.parts.pathname !== '/' && pathSegments(result.parts.pathname).length > 0 && (
            <Panel label="Path segments">
              <div className={styles.section}>
                <div className={styles.segments}>
                  {pathSegments(result.parts.pathname).map((seg, i) => (
                    <span key={i} style={{ display: 'contents' }}>
                      {i > 0 && <span className={styles.slash}>/</span>}
                      <span className={styles.segment}>{seg}</span>
                    </span>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          <Panel
            label="Query parameters"
            status={
              liveParams.length
                ? `${liveParams.length} param${liveParams.length === 1 ? '' : 's'}`
                : undefined
            }
            actions={
              <>
                {trackingCount > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => commitParams(stripTrackingParams(liveParams))}
                  >
                    Strip {trackingCount} tracking param{trackingCount === 1 ? '' : 's'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={addRow}>
                  <IconPlus size={13} />
                  Add
                </Button>
              </>
            }
          >
            {liveParams.length === 0 ? (
              <div style={{ padding: 'var(--sp-3)' }}>
                <EmptyState compact title="No query parameters">
                  Add one, or edit the URL above to include a "?" query string.
                </EmptyState>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.reorderCol} scope="col">
                        <span className="visually-hidden">Reorder</span>
                      </th>
                      <th scope="col">Key</th>
                      <th scope="col">Value</th>
                      <th className={styles.encodeCol} scope="col">
                        Encode
                      </th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveParams.map((row, i) => (
                      <QueryRow
                        key={i}
                        row={row}
                        index={i}
                        isFirst={i === 0}
                        isLast={i === liveParams.length - 1}
                        onChange={(patchRow) => updateRow(i, patchRow)}
                        onRemove={() => removeRow(i)}
                        onMove={(delta) => moveRow(i, delta)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {fragmentParams && (
            <Panel
              label="Fragment parameters"
              status={`${fragmentParams.length} param${fragmentParams.length === 1 ? '' : 's'}`}
            >
              <div className={styles.section}>
                <Callout tone="info">
                  The hash looks like a second query string, common in routers that predate the
                  History API. Shown for reference; edit it via the URL field above.
                </Callout>
                <div className={styles.partsGrid}>
                  {fragmentParams.map((p, i) => (
                    <PartRow key={i} label={p.key || '(empty)'} value={p.value} />
                  ))}
                </div>
              </div>
            </Panel>
          )}
        </PaneStack>
      )}
    </ToolShell>
  )
}

/** `display` overrides what is shown without changing what is copied. */
function PartRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const shown = display ?? value
  return (
    <>
      <span className={styles.partLabel}>{label}</span>
      <span className={shown ? styles.partValue : `${styles.partValue} ${styles.empty}`}>
        {shown || '(empty)'}
      </span>
      <CopyButton
        value={value}
        size="sm"
        variant="ghost"
        iconOnly
        disabled={!value}
        label={`Copy ${label}`}
      />
    </>
  )
}

function QueryRow({
  row,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMove,
}: {
  row: QueryParam
  index: number
  isFirst: boolean
  isLast: boolean
  onChange: (patch: Partial<QueryParam>) => void
  onRemove: () => void
  onMove: (delta: number) => void
}) {
  const tracking = trackingExplanation(row.key)
  // A raw form that differs from the decoded value after a second decode
  // pass is the double-encoding tell, computed inline here rather than in
  // the logic file's isDoubleEncoded, which is exercised directly by its own
  // tests; this just decides whether to show the hint.
  const showRaw = row.rawValue && row.rawValue !== row.value

  return (
    <tr>
      <td>
        <div className={styles.rowActions}>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label="Move up"
            disabled={isFirst}
            onClick={() => onMove(-1)}
          >
            ↑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            aria-label="Move down"
            disabled={isLast}
            onClick={() => onMove(1)}
          >
            ↓
          </Button>
        </div>
      </td>
      <td>
        <TextInput
          mono
          className={styles.cellInput}
          aria-label={`Key for row ${index + 1}`}
          value={row.key}
          onChange={(e) => onChange({ key: e.target.value })}
        />
      </td>
      <td>
        <TextInput
          mono
          className={styles.cellInput}
          aria-label={`Value for row ${index + 1}`}
          value={row.value}
          onChange={(e) => onChange({ value: e.target.value, flagOnly: false })}
        />
        {tracking && <span className={styles.trackingNote}>{tracking}</span>}
        {showRaw && <span className={styles.decodedHint}>raw: {row.rawValue}</span>}
      </td>
      <td className={styles.encodeCol}>
        <Checkbox
          label={<span className="visually-hidden">Percent-encode this value</span>}
          checked={row.encode}
          onChange={(e) => onChange({ encode: e.target.checked })}
        />
      </td>
      <td>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={`Remove row ${index + 1}`}
          onClick={onRemove}
        >
          <IconTrash size={13} />
        </Button>
      </td>
    </tr>
  )
}
