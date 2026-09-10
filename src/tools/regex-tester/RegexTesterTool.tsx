import { useEffect, useState, type ReactNode } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, TextInput } from '@/components/Field'
import { IconChevronDown, IconChevronRight, IconSearch, IconTrash } from '@/components/Icon'
import { PaneStack, TwoPane } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { runRegex } from '@/lib/regexRunner'
import type { RegexMatch, RegexResponse } from '@/lib/regexTypes'
import { pluralize } from '@/lib/format'
import { detectRisk, explainPattern, SAMPLE_PATTERNS } from './regexHelp'
import styles from './RegexTesterTool.module.css'

interface State {
  pattern: string
  flags: string
  text: string
  replacement: string
  useReplacement: boolean
}

const DEFAULTS: State = {
  pattern: '',
  flags: 'g',
  text: '',
  replacement: '',
  useReplacement: false,
}

const isState = shapeValidator<State>({
  pattern: 'string',
  flags: 'string',
  text: 'string',
  replacement: 'string',
  useReplacement: 'boolean',
})

const FLAG_CHARS = ['g', 'i', 'm', 's', 'u', 'y', 'd'] as const

const FLAG_LABELS: Record<(typeof FLAG_CHARS)[number], string> = {
  g: 'Global — find every match, not just the first',
  i: 'Case-insensitive',
  m: 'Multiline — ^ and $ match at line breaks too',
  s: 'Dotall — . also matches newlines',
  u: 'Unicode — treat the pattern as a sequence of code points',
  y: 'Sticky — match only starting at lastIndex',
  d: 'Indices — include start/end offsets for capture groups',
}

const CHEATSHEET: Array<{ token: string; meaning: string }> = [
  { token: '.', meaning: 'Any character' },
  { token: '\\d \\w \\s', meaning: 'Digit, word character, whitespace' },
  { token: '\\D \\W \\S', meaning: 'Negations of the above' },
  { token: '^ $', meaning: 'Start / end of string (or line, with m)' },
  { token: '\\b', meaning: 'Word boundary' },
  { token: '* + ?', meaning: '0+, 1+, 0-or-1 of the preceding token' },
  { token: '{n,m}', meaning: 'Between n and m repeats' },
  { token: '(...)', meaning: 'Capturing group' },
  { token: '(?:...)', meaning: 'Non-capturing group' },
  { token: '(?<name>...)', meaning: 'Named capturing group' },
  { token: '(?=...) (?!...)', meaning: 'Positive / negative lookahead' },
  { token: '(?<=...) (?<!...)', meaning: 'Positive / negative lookbehind' },
  { token: 'a|b', meaning: 'Alternation' },
  { token: '[abc] [^abc]', meaning: 'Character class / negated class' },
]

const DEBOUNCE_MS = 150
const MAX_MATCHES = 1000

export default function RegexTesterTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const [showCheatsheet, setShowCheatsheet] = useState(false)
  const [showExplain, setShowExplain] = useState(false)

  // Every keystroke would otherwise spawn a worker round trip — debouncing the
  // *request*, not the input, keeps typing responsive while capping how often
  // the actually expensive part (running the pattern) happens.
  const [debounced, setDebounced] = useState(state)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(state), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state])

  const [response, setResponse] = useState<RegexResponse | null>(null)
  useEffect(() => {
    if (debounced.pattern === '') {
      // Clearing the previous worker result, not deriving state: there is no
      // render-time expression for "the last async answer is now void".
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResponse(null)
      return
    }
    let stale = false
    void runRegex({
      pattern: debounced.pattern,
      flags: debounced.flags,
      text: debounced.text,
      replacement: debounced.useReplacement ? debounced.replacement : undefined,
      maxMatches: MAX_MATCHES,
    }).then((res) => {
      if (!stale) setResponse(res)
    })
    return () => {
      stale = true
    }
  }, [debounced])

  const toggleFlag = (flag: string) => {
    const flags = state.flags.includes(flag)
      ? state.flags.replace(flag, '')
      : FLAG_CHARS.filter((f) => f === flag || state.flags.includes(f)).join('')
    patch({ flags })
  }

  const risks = state.pattern ? detectRisk(state.pattern) : []
  const explanation = showExplain && state.pattern ? explainPattern(state.pattern) : []

  const loadSample = (sample: (typeof SAMPLE_PATTERNS)[number]) => {
    patch({ pattern: sample.pattern, flags: sample.flags, text: sample.sample })
  }

  return (
    <ToolShell
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCheatsheet((v) => !v)}
            pressed={showCheatsheet}
          >
            Cheatsheet
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ pattern: '', text: '', replacement: '' })}
            disabled={!state.pattern && !state.text}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <PaneStack>
        <Panel label="Pattern">
          <div className={styles.patternRow}>
            <span className={styles.slash}>/</span>
            <TextInput
              aria-label="Regular expression pattern"
              mono
              className={styles.patternInput}
              value={state.pattern}
              onChange={(e) => patch({ pattern: e.target.value })}
              placeholder="[a-z]+"
              invalid={response?.ok === false}
            />
            <span className={styles.slash}>/</span>
            <span className={styles.flagsDisplay}>{state.flags || '—'}</span>
          </div>

          <div className={styles.flagRow}>
            {FLAG_CHARS.map((f) => (
              <Checkbox
                key={f}
                label={f}
                title={FLAG_LABELS[f]}
                checked={state.flags.includes(f)}
                onChange={() => toggleFlag(f)}
              />
            ))}
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Samples:</span>
            {SAMPLE_PATTERNS.map((s) => (
              <Button key={s.name} size="sm" variant="ghost" onClick={() => loadSample(s)}>
                {s.name}
              </Button>
            ))}
          </div>

          {risks.length > 0 && (
            <div className={styles.warnings} role="status" aria-live="polite">
              {risks.map((r) => (
                <Callout key={r.index} tone="warn" title="Possible catastrophic backtracking">
                  {r.message}
                </Callout>
              ))}
            </div>
          )}

          {showCheatsheet && (
            <div className={styles.cheatsheet}>
              {CHEATSHEET.map((row) => (
                <div key={row.token} className={styles.cheatRow}>
                  <code className={styles.cheatToken}>{row.token}</code>
                  <span className={styles.cheatMeaning}>{row.meaning}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <TwoPane
          storageKey="regex-tester"
          labelFirst="test text"
          labelSecond="highlighted matches"
          input={
            <Panel label="Test text" status={pluralize(state.text.length, 'char')}>
              <CodeArea
                label="Text to test the pattern against"
                value={state.text}
                onValueChange={(text) => patch({ text })}
                softWrap
                placeholder="Paste text to test the pattern against, or load a sample above."
              />
            </Panel>
          }
          output={
            <Panel
              label="Highlighted"
              status={
                response?.ok
                  ? pluralize(response.matches.length, 'match', 'matches') +
                    (response.truncated ? ` (capped at ${MAX_MATCHES})` : '')
                  : undefined
              }
            >
              {!state.pattern ? (
                <EmptyState compact title="Enter a pattern above" mark={<IconSearch size={24} />}>
                  Matches highlight here as you type, with a 150ms debounce so every keystroke does
                  not run the pattern.
                </EmptyState>
              ) : !state.text ? (
                <EmptyState
                  compact
                  title="Now add some text to test"
                  mark={<IconSearch size={24} />}
                >
                  Paste into the left pane, or load one of the samples above to get a pattern and
                  matching text together.
                </EmptyState>
              ) : response === null ? (
                <EmptyState compact title="Waiting…" mark={<IconSearch size={24} />} />
              ) : !response.ok ? (
                <div style={{ padding: 'var(--sp-3)' }}>
                  <FailureCallout response={response} />
                </div>
              ) : state.text === '' ? (
                <EmptyState compact title="Nothing to search yet" mark={<IconSearch size={24} />}>
                  Paste text on the left to see matches highlighted here.
                </EmptyState>
              ) : response.matches.length === 0 ? (
                <EmptyState compact title="No matches" mark={<IconSearch size={24} />}>
                  The pattern is valid but does not match anything in the test text.
                </EmptyState>
              ) : (
                <div className={styles.highlighted} role="status" aria-live="polite">
                  {renderHighlighted(state.text, response.matches)}
                </div>
              )}
            </Panel>
          }
        />

        {response?.ok && response.matches.length > 0 && (
          <Panel label="Matches" status={pluralize(response.matches.length, 'match', 'matches')}>
            <ul className={styles.matchList}>
              {response.matches.map((m, i) => (
                <li key={i} className={styles.matchItem}>
                  <div className={styles.matchHead}>
                    <span className={styles.matchIndex}>#{i + 1}</span>
                    <code className={styles.matchText}>{m.text || '(empty match)'}</code>
                    <span className={styles.matchAt}>at {m.index}</span>
                    <CopyButton value={m.text} size="sm" variant="ghost" />
                  </div>
                  {(m.groups.length > 0 || Object.keys(m.named).length > 0) && (
                    <ul className={styles.groupList}>
                      {m.groups.map((g, gi) => (
                        <li key={`g${gi}`} className={styles.groupItem}>
                          <span className={styles.groupLabel}>${gi + 1}</span>
                          <code className={styles.groupValue}>{g ?? '(no match)'}</code>
                          {g !== undefined && (
                            <CopyButton value={g} size="sm" variant="ghost" iconOnly />
                          )}
                        </li>
                      ))}
                      {Object.entries(m.named).map(([name, value]) => (
                        <li key={name} className={styles.groupItem}>
                          <span className={styles.groupLabel}>{name}</span>
                          <code className={styles.groupValue}>{value ?? '(no match)'}</code>
                          {value !== undefined && (
                            <CopyButton value={value} size="sm" variant="ghost" iconOnly />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel label="Replace">
          <div className={styles.replaceBody}>
            <Checkbox
              label="Show replacement result"
              checked={state.useReplacement}
              onChange={(e) => patch({ useReplacement: e.target.checked })}
            />
            {state.useReplacement && (
              <>
                <TextInput
                  aria-label="Replacement pattern"
                  mono
                  value={state.replacement}
                  onChange={(e) => patch({ replacement: e.target.value })}
                  placeholder="$1-$<name>"
                />
                {response?.ok && response.replaced !== undefined ? (
                  <div className={styles.replaceResult}>
                    <CodeArea
                      label="Replacement result"
                      value={response.replaced}
                      readOnly
                      softWrap
                    />
                    <CopyButton value={response.replaced} />
                  </div>
                ) : (
                  <p className={styles.replaceHint}>
                    Use <code>$1</code>, <code>$2</code> for numbered groups and{' '}
                    <code>$&lt;name&gt;</code> for named ones.
                  </p>
                )}
              </>
            )}
          </div>
        </Panel>

        <Panel label="Explain pattern">
          <button
            type="button"
            className={styles.explainToggle}
            onClick={() => setShowExplain((v) => !v)}
            aria-expanded={showExplain}
          >
            {showExplain ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            {showExplain ? 'Hide breakdown' : 'Show token-by-token breakdown'}
          </button>
          {showExplain && (
            <ul className={styles.explainList}>
              {explanation.length === 0 ? (
                <li className={styles.explainEmpty}>Nothing to explain — enter a pattern above.</li>
              ) : (
                explanation.map((t, i) => (
                  <li key={i} className={styles.explainRow}>
                    <code className={styles.explainToken}>{t.token}</code>
                    <span className={styles.explainMeaning}>{t.meaning}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </Panel>
      </PaneStack>
    </ToolShell>
  )
}

function FailureCallout({ response }: { response: Extract<RegexResponse, { ok: false }> }) {
  if (response.kind === 'syntax') {
    return (
      <Callout tone="err" title="Invalid pattern" live>
        {response.error} — check for unbalanced parentheses or brackets, or a quantifier with
        nothing before it to repeat.
      </Callout>
    )
  }
  if (response.kind === 'timeout') {
    return (
      <Callout tone="err" title="Pattern timed out" live>
        {response.error}
      </Callout>
    )
  }
  return (
    <Callout tone="err" title="The pattern failed while running" live>
      {response.error}
    </Callout>
  )
}

function renderHighlighted(text: string, matches: RegexMatch[]): ReactNode {
  const nodes: ReactNode[] = []
  let cursor = 0
  matches.forEach((m, i) => {
    if (m.index > cursor) nodes.push(<span key={`t${i}`}>{text.slice(cursor, m.index)}</span>)
    nodes.push(
      <mark key={`m${i}`} className={styles.match} title={`Match #${i + 1}`}>
        {text.slice(m.index, m.index + m.length)}
      </mark>,
    )
    cursor = Math.max(cursor, m.index + m.length)
  })
  if (cursor < text.length) nodes.push(<span key="tail">{text.slice(cursor)}</span>)
  return nodes
}
