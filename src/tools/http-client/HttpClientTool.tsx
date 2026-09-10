import { useMemo, useRef, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { StatGrid, type Stat } from '@/components/StatGrid'
import { Checkbox, Select, SegmentedControl, TextInput } from '@/components/Field'
import { IconGlobe, IconPlus, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { formatBytes, formatDuration, pluralize } from '@/lib/format'
import styles from './HttpClientTool.module.css'
import {
  COMMON_HEADERS,
  DEFAULT_TIMEOUT_MS,
  HTTP_METHODS,
  MAX_HISTORY,
  contentTypeForBody,
  explainFetchFailure,
  isForbiddenHeader,
  parseQueryParams,
  prettyPrintIfJson,
  sendHttpRequest,
  toCurl,
  withQueryParams,
  type BodyMode,
  type HttpMethod,
  type KeyValueRow,
  type SendRequestResult,
} from './http'

// A module-level counter for history-row React keys. Kept as a plain
// top-level function rather than inline `historyIdSeq += 1` inside the
// component: React's purity lint flags mutating state that outlives a
// render *from within* component code, even inside an event handler, and a
// call to an ordinary function declared outside the component is exactly
// what it expects side effects like this to look like.
let historyIdSeq = 0
function nextHistoryId(): string {
  historyIdSeq += 1
  return `h${historyIdSeq}`
}

interface State {
  method: HttpMethod
  url: string
}

// Deliberately NOT in useShareState: headers routinely carry bearer tokens
// and API keys, and this object base64-encodes straight into a URL that can
// end up in browser history, a chat log, or a bug-tracker screenshot. Only
// the method and URL, the part someone actually wants a colleague to be
// able to open with one click, are shareable. The UI says so, once.
const DEFAULTS: State = { method: 'GET', url: '' }
const isState = shapeValidator<State>({ method: 'string', url: 'string' })

const SAMPLE_URL = 'https://httpbin.org/get?greeting=hello'

type ResponseState =
  Extract<SendRequestResult, { ok: true }> | { ok: false; timeMs: number; errorMessage: string }

interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status?: number
  timeMs?: number
}

type RequestSection = 'query' | 'headers' | 'body'

export default function HttpClientTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const [section, setSection] = useState<RequestSection>('query')
  const [headers, setHeaders] = useState<KeyValueRow[]>([
    { key: 'Accept', value: 'application/json', enabled: true },
  ])
  const [bodyMode, setBodyMode] = useState<BodyMode>('none')
  const [rawBody, setRawBody] = useState('')
  const [rawContentType, setRawContentType] = useState('text/plain')
  const [formRows, setFormRows] = useState<KeyValueRow[]>([{ key: '', value: '', enabled: true }])
  const [timeoutMs, setTimeoutMs] = useState(DEFAULT_TIMEOUT_MS)
  const [sendCredentials, setSendCredentials] = useState(false)

  const [sending, setSending] = useState(false)
  const [response, setResponse] = useState<ResponseState | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const timedOutRef = useRef(false)

  const queryRows = useMemo(() => parseQueryParams(state.url), [state.url])

  const updateQuery = (next: KeyValueRow[]) => {
    patch({ url: withQueryParams(state.url, next) })
  }

  const bodyAllowed = state.method !== 'GET' && state.method !== 'HEAD'
  const effectiveContentType =
    bodyMode === 'none' ? undefined : contentTypeForBody(bodyMode, rawContentType)

  const effectiveBody = (): string | undefined => {
    if (!bodyAllowed || bodyMode === 'none') return undefined
    if (bodyMode === 'form') {
      const params = new URLSearchParams()
      for (const row of formRows) {
        const key = row.key.trim()
        if (row.enabled && key) params.append(key, row.value)
      }
      return params.toString()
    }
    return rawBody
  }

  const effectiveHeaders = (): KeyValueRow[] => {
    const hasContentType = headers.some(
      (h) => h.enabled && h.key.trim().toLowerCase() === 'content-type',
    )
    if (!effectiveContentType || hasContentType) return headers
    return [...headers, { key: 'Content-Type', value: effectiveContentType, enabled: true }]
  }

  const pushHistory = (entry: Omit<HistoryEntry, 'id'>) => {
    setHistory((prev) => [{ ...entry, id: nextHistoryId() }, ...prev].slice(0, MAX_HISTORY))
  }

  const send = async () => {
    const controller = new AbortController()
    abortRef.current = controller
    timedOutRef.current = false
    setSending(true)
    setResponse(null)

    const timeoutId = setTimeout(() => {
      timedOutRef.current = true
      controller.abort()
    }, timeoutMs)

    const result = await sendHttpRequest({
      method: state.method,
      url: state.url,
      headers: effectiveHeaders(),
      body: effectiveBody(),
      sendCredentials,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    setSending(false)
    abortRef.current = null

    if (result.ok) {
      setResponse(result)
      pushHistory({
        method: state.method,
        url: state.url,
        status: result.status,
        timeMs: result.timeMs,
      })
    } else {
      const errorMessage = explainFetchFailure(result.error, state.url, window.location.href, {
        timedOut: timedOutRef.current,
      })
      setResponse({ ok: false, timeMs: result.timeMs, errorMessage })
      pushHistory({ method: state.method, url: state.url, timeMs: result.timeMs })
    }
  }

  const cancel = () => abortRef.current?.abort()

  const curl = toCurl({
    method: state.method,
    url: state.url,
    headers: effectiveHeaders(),
    body: effectiveBody(),
  })

  const statusTone = !response?.ok
    ? 'err'
    : response.status < 300
      ? 'ok'
      : response.status < 400
        ? 'warn'
        : 'err'

  const summaryStats: Stat[] | null = response?.ok
    ? [
        { label: 'Time', value: formatDuration(response.timeMs) },
        { label: 'Size', value: formatBytes(response.sizeBytes) },
        { label: 'Headers', value: pluralize(response.headers.length, 'header') },
      ]
    : null

  return (
    <ToolShell
      actions={
        <Button size="sm" variant="ghost" onClick={() => patch({ method: 'GET', url: SAMPLE_URL })}>
          Sample
        </Button>
      }
    >
      <Callout tone="info">
        This tool runs in your browser, so normal CORS rules apply, a target that has not opted in
        will fail with a generic error, explained below as best it can be. Browsers silently drop
        forbidden headers (Host, Origin, Cookie, Referer, and a few others) even if you set them
        here. Cookies are not sent unless "Send credentials" is checked. Only the method and URL are
        included in a Share link, headers and the body routinely carry secrets, so they stay local
        to this tab.
      </Callout>

      <Panel label="Request" bodyClassName={styles.section}>
        <div className={styles.urlRow}>
          <Select
            className={styles.methodSelect}
            mono
            aria-label="HTTP method"
            value={state.method}
            onChange={(e) => patch({ method: e.target.value as HttpMethod })}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <TextInput
            mono
            className={styles.urlInput}
            aria-label="Request URL"
            value={state.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://api.example.com/resource"
          />
          {sending ? (
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void send()} disabled={!state.url.trim()}>
              Send
            </Button>
          )}
        </div>
      </Panel>

      <OptionsBar>
        <OptionGroup>
          <SegmentedControl
            label="Request section"
            value={section}
            onChange={setSection}
            options={[
              { value: 'query', label: `Query${queryRows.length ? ` (${queryRows.length})` : ''}` },
              { value: 'headers', label: `Headers${headers.length ? ` (${headers.length})` : ''}` },
              { value: 'body', label: 'Body' },
            ]}
          />
        </OptionGroup>
        {section === 'body' && (
          <OptionGroup label="Mode">
            <SegmentedControl
              label="Body mode"
              value={bodyMode}
              onChange={setBodyMode}
              options={[
                { value: 'none', label: 'None' },
                { value: 'raw', label: 'Raw' },
                { value: 'json', label: 'JSON' },
                { value: 'form', label: 'Form' },
              ]}
            />
          </OptionGroup>
        )}
        <OptionSpacer />
        <OptionGroup label="Timeout">
          <TextInput
            type="number"
            mono
            style={{ width: '5rem' }}
            min={1}
            aria-label="Timeout in seconds"
            value={Math.round(timeoutMs / 1000)}
            onChange={(e) => setTimeoutMs(Math.max(1, Number(e.target.value) || 1) * 1000)}
          />
        </OptionGroup>
        <OptionGroup>
          <Checkbox
            label="Send credentials"
            checked={sendCredentials}
            onChange={(e) => setSendCredentials(e.target.checked)}
          />
        </OptionGroup>
      </OptionsBar>

      {!bodyAllowed && section === 'body' && (
        <div style={{ padding: '0 var(--sp-3)' }}>
          <Callout tone="info">
            {state.method} requests do not send a body, switch method to enable one.
          </Callout>
        </div>
      )}

      <PaneStack>
        {section === 'query' && (
          <KeyValueTable
            title="Query parameters"
            rows={queryRows}
            onChange={updateQuery}
            keyPlaceholder="param"
            valuePlaceholder="value"
            emptyMessage="No query parameters. Add one below, or append ?key=value to the URL."
          />
        )}
        {section === 'headers' && (
          <KeyValueTable
            title="Headers"
            rows={headers}
            onChange={setHeaders}
            keyPlaceholder="Header-Name"
            valuePlaceholder="value"
            headerList={COMMON_HEADERS}
            flagForbidden
            emptyMessage="No headers set."
          />
        )}
        {section === 'body' && bodyAllowed && bodyMode === 'none' && (
          <Panel label="Body">
            <div style={{ padding: 'var(--sp-3)' }}>
              <EmptyState compact title="No body">
                Switch to Raw, JSON, or Form to send one.
              </EmptyState>
            </div>
          </Panel>
        )}
        {section === 'body' && bodyAllowed && bodyMode === 'form' && (
          <KeyValueTable
            title="Form fields"
            rows={formRows}
            onChange={setFormRows}
            keyPlaceholder="field"
            valuePlaceholder="value"
            emptyMessage="No form fields."
          />
        )}
        {section === 'body' && bodyAllowed && (bodyMode === 'raw' || bodyMode === 'json') && (
          <Panel label="Body" status={effectiveContentType}>
            {bodyMode === 'raw' && (
              <div style={{ padding: 'var(--sp-3)', paddingBottom: 0 }}>
                <TextInput
                  mono
                  aria-label="Content-Type"
                  value={rawContentType}
                  onChange={(e) => setRawContentType(e.target.value)}
                  placeholder="text/plain"
                />
              </div>
            )}
            <CodeArea
              label="Request body"
              value={rawBody}
              onValueChange={setRawBody}
              softWrap
              lineNumbers
              placeholder={bodyMode === 'json' ? '{\n  "key": "value"\n}' : 'raw body text'}
            />
          </Panel>
        )}

        <Panel
          label="Response"
          actions={
            <>
              <CopyButton value={curl} label="Copy as cURL" disabled={!state.url.trim()} />
              {response?.ok && (
                <CopyButton
                  value={response.bodyText ?? ''}
                  label="Copy body"
                  disabled={!response.bodyText}
                />
              )}
            </>
          }
        >
          {sending ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <Callout tone="info" live>
                Sending…
              </Callout>
            </div>
          ) : !response ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <EmptyState compact title="No response yet" mark={<IconGlobe size={24} />}>
                Send a request to see status, timing, headers, and body here.
              </EmptyState>
            </div>
          ) : !response.ok ? (
            <div style={{ padding: 'var(--sp-3)' }}>
              <Callout tone="err" title="Request failed" live>
                {response.errorMessage}
              </Callout>
            </div>
          ) : (
            <div className={styles.section}>
              <div className={styles.statusLine}>
                <span className={`${styles.statusCode} ${styles[statusTone]}`}>
                  {response.status} {response.statusText}
                </span>
                {summaryStats && <StatGrid stats={summaryStats} />}
              </div>

              {response.headers && response.headers.length > 0 && (
                <div className={styles.headerList}>
                  {response.headers.map(([key, value]) => (
                    <div className={styles.headerRow} key={key}>
                      <span className={styles.headerKey}>{key}</span>
                      <span className={styles.headerValue}>{value}</span>
                    </div>
                  ))}
                </div>
              )}

              <CodeArea
                label="Response body"
                value={prettyPrintIfJson(response.bodyText ?? '', response.contentType ?? null)}
                readOnly
                softWrap
                lineNumbers
                placeholder="(empty body)"
              />
            </div>
          )}
        </Panel>

        {history.length > 0 && (
          <Panel label="History" status={pluralize(history.length, 'request')}>
            <div className={styles.historyList}>
              {history.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={styles.historyRow}
                  onClick={() => patch({ method: entry.method, url: entry.url })}
                  title="Load this method and URL"
                >
                  <span className={styles.historyMethod}>{entry.method}</span>
                  <span className={styles.historyUrl}>{entry.url}</span>
                  <span className={styles.historyStatus}>
                    {entry.status ? `${entry.status}` : 'failed'} ·{' '}
                    {entry.timeMs !== undefined ? formatDuration(entry.timeMs) : '—'}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
        )}
      </PaneStack>
    </ToolShell>
  )
}

function KeyValueTable({
  title,
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  headerList,
  flagForbidden,
  emptyMessage,
}: {
  title: string
  rows: KeyValueRow[]
  onChange: (rows: KeyValueRow[]) => void
  keyPlaceholder: string
  valuePlaceholder: string
  headerList?: string[]
  flagForbidden?: boolean
  emptyMessage: string
}) {
  const update = (index: number, patchRow: Partial<KeyValueRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patchRow } : r)))
  }
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const add = () => onChange([...rows, { key: '', value: '', enabled: true }])
  const listId = headerList ? 'http-client-common-headers' : undefined

  return (
    <Panel
      label={title}
      actions={
        <Button size="sm" variant="ghost" onClick={add}>
          <IconPlus size={13} />
          Add
        </Button>
      }
    >
      {headerList && (
        <datalist id={listId}>
          {headerList.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      )}
      {rows.length === 0 ? (
        <div style={{ padding: 'var(--sp-3)' }}>
          <EmptyState compact title={emptyMessage} />
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.enabledCol} scope="col">
                  <span className="visually-hidden">Enabled</span>
                </th>
                <th scope="col">Key</th>
                <th scope="col">Value</th>
                <th scope="col">
                  <span className="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const forbidden = flagForbidden && isForbiddenHeader(row.key)
                return (
                  <tr key={i}>
                    <td className={styles.enabledCol}>
                      <Checkbox
                        label={<span className="visually-hidden">Row {i + 1} enabled</span>}
                        checked={row.enabled}
                        onChange={(e) => update(i, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <TextInput
                        mono
                        className={styles.cellInput}
                        aria-label={`Row ${i + 1} key`}
                        value={row.key}
                        onChange={(e) => update(i, { key: e.target.value })}
                        placeholder={keyPlaceholder}
                        list={listId}
                      />
                      {forbidden && (
                        <span className={styles.warnNote}>
                          Forbidden header, the browser will silently drop this.
                        </span>
                      )}
                    </td>
                    <td>
                      <TextInput
                        mono
                        className={styles.cellInput}
                        aria-label={`Row ${i + 1} value`}
                        value={row.value}
                        onChange={(e) => update(i, { value: e.target.value })}
                        placeholder={valuePlaceholder}
                      />
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        aria-label={`Remove row ${i + 1}`}
                        onClick={() => remove(i)}
                      >
                        <IconTrash size={13} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}
