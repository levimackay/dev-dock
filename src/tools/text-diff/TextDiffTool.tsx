import { useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { Button } from '@/components/Button'
import { Callout } from '@/components/Callout'
import { EmptyState } from '@/components/EmptyState'
import { StatGrid, type Stat } from '@/components/StatGrid'
import { Checkbox, SegmentedControl, Select } from '@/components/Field'
import { IconArrowSwap, IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack, TwoPane } from '@/tools/shared/TwoPane'
import { DiffView, type ChangeGroupInfo } from '@/tools/shared/DiffView'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { diffLines } from '@/lib/diff'
import { pluralize } from '@/lib/format'
import { SAMPLE_LEFT, SAMPLE_RIGHT, similarityPercent } from './textdiff'

interface State {
  left: string
  right: string
  mode: 'side-by-side' | 'unified'
  ignoreWhitespace: boolean
  ignoreCase: boolean
  contextLines: number
}

const DEFAULTS: State = {
  left: '',
  right: '',
  mode: 'side-by-side',
  ignoreWhitespace: false,
  ignoreCase: false,
  contextLines: 3,
}

const isState = shapeValidator<State>({
  left: 'string',
  right: 'string',
  mode: 'string',
  ignoreWhitespace: 'boolean',
  ignoreCase: 'boolean',
  contextLines: 'number',
})

export default function TextDiffTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))
  // Only used to render "change N of M" if a future revision adds jump-to-change
  // nav here too, kept for symmetry with Code Diff's DiffView usage, cheap to
  // leave wired since DiffView calls it unconditionally anyway.
  const [, setChangeGroups] = useState<ChangeGroupInfo[]>([])

  const result = useMemo(
    () =>
      diffLines(state.left, state.right, {
        ignoreWhitespace: state.ignoreWhitespace,
        ignoreCase: state.ignoreCase,
      }),
    [state.left, state.right, state.ignoreWhitespace, state.ignoreCase],
  )

  const stats: Stat[] = [
    { label: 'added', value: result.added, accent: result.added > 0 },
    { label: 'removed', value: result.removed, accent: result.removed > 0 },
    { label: 'unchanged', value: result.unchanged },
    { label: 'similarity', value: `${similarityPercent(result)}%` },
  ]

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
            onClick={() => patch({ left: state.right, right: state.left })}
            disabled={!hasInput}
          >
            <IconArrowSwap size={13} />
            Swap sides
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
        <OptionGroup>
          <Checkbox
            label="Ignore whitespace"
            checked={state.ignoreWhitespace}
            onChange={(e) => patch({ ignoreWhitespace: e.target.checked })}
          />
          <Checkbox
            label="Ignore case"
            checked={state.ignoreCase}
            onChange={(e) => patch({ ignoreCase: e.target.checked })}
          />
        </OptionGroup>
        {state.mode === 'unified' && (
          <OptionGroup label="Context">
            <Select
              aria-label="Context lines around each change"
              value={String(state.contextLines)}
              onChange={(e) => patch({ contextLines: Number(e.target.value) })}
            >
              {[1, 2, 3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} lines
                </option>
              ))}
            </Select>
          </OptionGroup>
        )}
        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        <TwoPane
          storageKey="text-diff"
          labelFirst="left text"
          labelSecond="right text"
          input={
            <Panel label="Left" status={pluralize(splitLineCount(state.left), 'line')}>
              <CodeArea
                label="Left text"
                value={state.left}
                onValueChange={(left) => patch({ left })}
                softWrap
                acceptDrop
                placeholder="Paste the original text, or drop a file."
              />
            </Panel>
          }
          output={
            <Panel label="Right" status={pluralize(splitLineCount(state.right), 'line')}>
              <CodeArea
                label="Right text"
                value={state.right}
                onValueChange={(right) => patch({ right })}
                softWrap
                acceptDrop
                placeholder="Paste the changed text, or drop a file."
              />
            </Panel>
          }
        />

        {!hasInput ? (
          <Panel>
            <EmptyState compact title="Nothing to compare yet" mark={<IconLayers size={24} />}>
              Paste text on both sides above, or load the Sample to see word-level highlighting
              inside changed lines.
            </EmptyState>
          </Panel>
        ) : (
          <>
            {result.degraded && (
              <Callout tone="warn" title="These inputs are too dissimilar for a precise diff" live>
                The edit distance between the two texts exceeded the safety ceiling this tool uses
                to stay responsive, so every line below is shown as a coarse remove-then-add instead
                of a real line-by-line alignment.
              </Callout>
            )}

            <Panel label="Summary" padded>
              <StatGrid stats={stats} />
            </Panel>

            <Panel label="Diff">
              {!hasChanges ? (
                <EmptyState compact title="No differences" mark={<IconLayers size={24} />}>
                  The left and right text are identical
                  {state.ignoreWhitespace || state.ignoreCase
                    ? ' under the current ignore options.'
                    : '.'}
                </EmptyState>
              ) : (
                <DiffView
                  result={result}
                  mode={state.mode}
                  leftLabel="left"
                  rightLabel="right"
                  idPrefix="text-diff"
                  collapse={
                    state.mode === 'unified'
                      ? {
                          threshold: state.contextLines * 2 + 1,
                          context: state.contextLines,
                          interactive: false,
                        }
                      : undefined
                  }
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
