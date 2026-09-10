import { useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { Checkbox, SegmentedControl, Select, TextInput } from '@/components/Field'
import { Kbd } from '@/components/Kbd'
import { IconArrowSwap, IconDownload, IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack, TwoPane } from '@/tools/shared/TwoPane'
import { DiffView, type ChangeGroupInfo } from '@/tools/shared/DiffView'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { diffLines, toUnifiedDiff } from '@/lib/diff'
import { pluralize } from '@/lib/format'
import { downloadText } from '@/lib/download'
import { useHotkey } from '@/lib/useHotkey'
import { preprocessForDiff, sanitizeFileLabel, SAMPLE_LEFT, SAMPLE_RIGHT } from './codediff'
import styles from './CodeDiffTool.module.css'

interface State {
  left: string
  right: string
  leftName: string
  rightName: string
  mode: 'side-by-side' | 'unified'
  tabWidth: number
  ignoreTrailingWhitespace: boolean
  ignoreBlankLines: boolean
}

const DEFAULTS: State = {
  left: '',
  right: '',
  leftName: 'original',
  rightName: 'modified',
  mode: 'side-by-side',
  tabWidth: 2,
  ignoreTrailingWhitespace: false,
  ignoreBlankLines: false,
}

const isState = shapeValidator<State>({
  left: 'string',
  right: 'string',
  leftName: 'string',
  rightName: 'string',
  mode: 'string',
  tabWidth: 'number',
  ignoreTrailingWhitespace: 'boolean',
  ignoreBlankLines: 'boolean',
})

// Runs longer than this collapse behind a "N unchanged lines" toggle, the
// one interaction that makes Code Diff read differently from Text Diff, which
// always shows every line.
const COLLAPSE_THRESHOLD = 6

export default function CodeDiffTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const preprocessed = useMemo(
    () => ({
      left: preprocessForDiff(state.left, {
        ignoreTrailingWhitespace: state.ignoreTrailingWhitespace,
        ignoreBlankLines: state.ignoreBlankLines,
      }),
      right: preprocessForDiff(state.right, {
        ignoreTrailingWhitespace: state.ignoreTrailingWhitespace,
        ignoreBlankLines: state.ignoreBlankLines,
      }),
    }),
    [state.left, state.right, state.ignoreTrailingWhitespace, state.ignoreBlankLines],
  )

  const result = useMemo(() => diffLines(preprocessed.left, preprocessed.right), [preprocessed])

  const patchText = useMemo(() => {
    const leftName = `a/${sanitizeFileLabel(state.leftName, 'original')}`
    const rightName = `b/${sanitizeFileLabel(state.rightName, 'modified')}`
    return toUnifiedDiff(preprocessed.left, preprocessed.right, { leftName, rightName })
  }, [preprocessed, state.leftName, state.rightName])

  const [changeGroups, setChangeGroups] = useState<ChangeGroupInfo[]>([])
  const [changeIndex, setChangeIndex] = useState(0)
  // A fresh diff can shrink the group count out from under a stale index.
  // Clamped during render for the same reason DiffView resets its expansion
  // set there: an effect would render one frame pointing at a change that no
  // longer exists.
  const [lastGroups, setLastGroups] = useState(changeGroups)
  if (lastGroups !== changeGroups) {
    setLastGroups(changeGroups)
    setChangeIndex((i) => (changeGroups.length === 0 ? 0 : Math.min(i, changeGroups.length - 1)))
  }

  const goToChange = (delta: number) => {
    if (changeGroups.length === 0) return
    const next = (changeIndex + delta + changeGroups.length) % changeGroups.length
    setChangeIndex(next)
    const group = changeGroups[next]
    if (group) {
      // `base.css` forces CSS `scroll-behavior` back to `auto` under
      // prefers-reduced-motion, but that override cannot reach a `behavior`
      // passed straight to `scrollIntoView`. This is the one JS-driven
      // scroll in the app, so it has to make the same check itself.
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      document.getElementById(group.id)?.scrollIntoView({
        block: 'center',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    }
  }

  // "n / p when not typing", useHotkey suppresses unmodified bindings while
  // focus is in a text field by default, which is exactly the "not typing"
  // gate the spec asks for, so no extra focus-tracking is needed here.
  useHotkey('n', () => goToChange(1))
  useHotkey('p', () => goToChange(-1))

  const hasInput = state.left !== '' || state.right !== ''
  const hasChanges = result.added > 0 || result.removed > 0

  return (
    <ToolShell
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ left: SAMPLE_LEFT, right: SAMPLE_RIGHT })}
          >
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              patch({
                left: state.right,
                right: state.left,
                leftName: state.rightName,
                rightName: state.leftName,
              })
            }
            disabled={!hasInput}
          >
            <IconArrowSwap size={13} />
            Swap
          </Button>
          <CopyButton value={() => patchText} label="Copy patch" disabled={!hasChanges} />
          <Button
            size="sm"
            variant="ghost"
            disabled={!hasChanges}
            onClick={() =>
              downloadText(
                `${sanitizeFileLabel(state.rightName, 'modified')}.patch`,
                patchText,
                'text/plain',
              )
            }
          >
            <IconDownload size={13} />
            Download .patch
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ left: '', right: '' })}
            disabled={!hasInput}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup label="View">
          <SegmentedControl
            label="Display mode"
            value={state.mode}
            onChange={(mode) => patch({ mode })}
            options={[
              { value: 'side-by-side', label: 'Side by side' },
              { value: 'unified', label: 'Unified' },
            ]}
          />
        </OptionGroup>
        <OptionGroup label="Tabs">
          <Select
            aria-label="Tab width"
            value={String(state.tabWidth)}
            onChange={(e) => patch({ tabWidth: Number(e.target.value) })}
          >
            {[2, 4, 8].map((n) => (
              <option key={n} value={n}>
                {n} spaces
              </option>
            ))}
          </Select>
        </OptionGroup>
        <OptionGroup>
          <Checkbox
            label="Ignore trailing whitespace"
            checked={state.ignoreTrailingWhitespace}
            onChange={(e) => patch({ ignoreTrailingWhitespace: e.target.checked })}
          />
          <Checkbox
            label="Ignore blank lines"
            checked={state.ignoreBlankLines}
            onChange={(e) => patch({ ignoreBlankLines: e.target.checked })}
          />
        </OptionGroup>
        <OptionGroup label="Filenames">
          <TextInput
            aria-label="Left filename"
            mono
            className={styles.filenameInput}
            value={state.leftName}
            onChange={(e) => patch({ leftName: e.target.value })}
            placeholder="original"
          />
          <TextInput
            aria-label="Right filename"
            mono
            className={styles.filenameInput}
            value={state.rightName}
            onChange={(e) => patch({ rightName: e.target.value })}
            placeholder="modified"
          />
        </OptionGroup>
        <OptionSpacer />
        {hasChanges && (
          <OptionGroup label="Change">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => goToChange(-1)}
              title="Previous change (P)"
            >
              ‹ Prev
            </Button>
            {/* Live: Prev/Next is a discrete user action, not a per-keystroke
                redraw, so announcing the new position is the courtesy case
                rather than the over-announce one. */}
            <span className={styles.changeCount} role="status" aria-live="polite">
              {changeGroups.length === 0
                ? '0 of 0'
                : `${changeIndex + 1} of ${changeGroups.length}`}
            </span>
            <Button size="sm" variant="ghost" onClick={() => goToChange(1)} title="Next change (N)">
              Next ›
            </Button>
            <Kbd combo="n" quiet />
            <Kbd combo="p" quiet />
          </OptionGroup>
        )}
      </OptionsBar>

      <PaneStack>
        <TwoPane
          storageKey="code-diff"
          labelFirst="left source"
          labelSecond="right source"
          input={
            <Panel
              label={state.leftName || 'Left'}
              status={pluralize(splitLineCount(state.left), 'line')}
            >
              <CodeArea
                label="Left source"
                value={state.left}
                onValueChange={(left) => patch({ left })}
                lineNumbers
                acceptDrop
                placeholder="Paste the original source, or drop a file."
              />
            </Panel>
          }
          output={
            <Panel
              label={state.rightName || 'Right'}
              status={pluralize(splitLineCount(state.right), 'line')}
            >
              <CodeArea
                label="Right source"
                value={state.right}
                onValueChange={(right) => patch({ right })}
                lineNumbers
                acceptDrop
                placeholder="Paste the modified source, or drop a file."
              />
            </Panel>
          }
        />

        {!hasInput ? (
          <Panel>
            <EmptyState compact title="Nothing to compare yet" mark={<IconLayers size={24} />}>
              Paste source on both sides above, or load the Sample to see a realistic patch.
            </EmptyState>
          </Panel>
        ) : (
          <>
            {result.degraded && (
              <Callout tone="warn" title="These inputs are too dissimilar for a precise diff" live>
                The edit distance exceeded the safety ceiling, so the result below is a coarse
                remove-then-add rather than a real line-by-line alignment.
              </Callout>
            )}

            <Panel label="Diff" className={styles[`tab${state.tabWidth}`]}>
              {!hasChanges ? (
                <EmptyState compact title="No differences" mark={<IconLayers size={24} />}>
                  The left and right source are identical
                  {state.ignoreTrailingWhitespace || state.ignoreBlankLines
                    ? ' under the current ignore options.'
                    : '.'}
                </EmptyState>
              ) : (
                <DiffView
                  result={result}
                  mode={state.mode}
                  leftLabel={state.leftName || 'left'}
                  rightLabel={state.rightName || 'right'}
                  idPrefix="code-diff"
                  collapse={{ threshold: COLLAPSE_THRESHOLD, context: 0, interactive: true }}
                  onChangeGroups={setChangeGroups}
                />
              )}
            </Panel>
          </>
        )}
      </PaneStack>
    </ToolShell>
  )
}

function splitLineCount(text: string): number {
  return text === '' ? 0 : text.split(/\r\n|\r|\n/).length
}
