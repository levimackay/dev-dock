import { useEffect, useMemo, useState } from 'react'
import { ToolShell } from '@/components/ToolShell'
import { Panel } from '@/components/Panel'
import { CodeArea } from '@/components/CodeArea'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { StatGrid, type Stat } from '@/components/StatGrid'
import { Checkbox } from '@/components/Field'
import { IconLayers, IconTrash } from '@/components/Icon'
import { OptionGroup, OptionSpacer, OptionsBar, PaneStack } from '@/tools/shared/TwoPane'
import { shapeValidator, useShareState } from '@/tools/useShareState'
import { formatCount, pluralize } from '@/lib/format'
import {
  characterClassCounts,
  characterFrequency,
  countCharacters,
  countLines,
  countParagraphs,
  countSentences,
  countUniqueWords,
  countWords,
  fleschKincaidGrade,
  fleschReadingEase,
  longestWords,
  READING_WPM,
  readingEaseBand,
  readingTimeMinutes,
  SAMPLE_TEXT,
  SPEAKING_WPM,
  speakingTimeMinutes,
  totalSyllables,
  wordFrequency,
} from './stats'
import styles from './TextStatsTool.module.css'

interface State {
  input: string
  includeStopwords: boolean
}

const DEFAULTS: State = { input: '', includeStopwords: false }

const isState = shapeValidator<State>({ input: 'string', includeStopwords: 'boolean' })

// Recomputing everything below runs in low-single-digit milliseconds for
// anything under ~100 KB, but a debounce still costs nothing on a fast input
// and keeps a very large paste from recomputing on every intermediate
// keystroke while the paste event itself is still landing.
const DEBOUNCE_MS = 120

function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} sec`
  return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} min`
}

export default function TextStatsTool() {
  const [state, setState] = useShareState<State>(DEFAULTS, isState)
  const patch = (next: Partial<State>) => setState((prev) => ({ ...prev, ...next }))

  const [debounced, setDebounced] = useState(state.input)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(state.input), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state.input])

  const stats = useMemo(() => {
    const text = debounced
    const words = countWords(text)
    const sentences = countSentences(text)
    const syllables = totalSyllables(text)
    const chars = countCharacters(text)
    return {
      words,
      uniqueWords: countUniqueWords(text),
      sentences,
      paragraphs: countParagraphs(text),
      lines: countLines(text),
      chars,
      bytes: new TextEncoder().encode(text).length,
      avgWordLength: words === 0 ? 0 : chars.withoutSpaces / words,
      avgSentenceLength: sentences === 0 ? 0 : words / sentences,
      readingEase: fleschReadingEase(words, sentences, syllables),
      gradeLevel: fleschKincaidGrade(words, sentences, syllables),
      readingMinutes: readingTimeMinutes(words),
      speakingMinutes: speakingTimeMinutes(words),
      classes: characterClassCounts(text),
      longest: longestWords(text),
      wordFreq: wordFrequency(text, state.includeStopwords),
      charFreq: characterFrequency(text),
    }
  }, [debounced, state.includeStopwords])

  const headline: Stat[] = [
    { label: 'words', value: formatCount(stats.words) },
    { label: 'characters', value: stats.chars.withSpaces.toLocaleString() },
    { label: 'sentences', value: stats.sentences.toLocaleString() },
    { label: 'paragraphs', value: stats.paragraphs.toLocaleString() },
  ]

  const detail: Stat[] = [
    { label: 'chars (no spaces)', value: stats.chars.withoutSpaces.toLocaleString() },
    { label: 'UTF-8 bytes', value: stats.bytes.toLocaleString() },
    { label: 'unique words', value: stats.uniqueWords.toLocaleString() },
    { label: 'lines', value: stats.lines.toLocaleString() },
    { label: 'avg word length', value: `${stats.avgWordLength.toFixed(1)} chars` },
    { label: 'avg sentence length', value: `${stats.avgSentenceLength.toFixed(1)} words` },
    {
      label: 'reading time',
      value: formatMinutes(stats.readingMinutes),
      note: `${READING_WPM} wpm`,
    },
    {
      label: 'speaking time',
      value: formatMinutes(stats.speakingMinutes),
      note: `${SPEAKING_WPM} wpm`,
    },
  ]

  const readability: Stat[] = [
    {
      label: 'Flesch Reading Ease',
      value: stats.readingEase.toFixed(1),
      note: readingEaseBand(stats.readingEase),
    },
    {
      label: 'Flesch-Kincaid Grade',
      value: stats.gradeLevel.toFixed(1),
      note: 'US school grade level',
    },
  ]

  const hasInput = state.input !== ''

  return (
    <ToolShell
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => patch({ input: SAMPLE_TEXT })}>
            Sample
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ input: '' })}
            disabled={!hasInput}
          >
            <IconTrash size={13} />
            Clear
          </Button>
        </>
      }
    >
      <OptionsBar>
        <OptionGroup>
          <Checkbox
            label="Include stopwords in frequency"
            checked={state.includeStopwords}
            onChange={(e) => patch({ includeStopwords: e.target.checked })}
          />
        </OptionGroup>
        <OptionSpacer />
      </OptionsBar>

      <PaneStack>
        <Panel
          label="Text"
          status={hasInput ? pluralize(stats.chars.withSpaces, 'char') : undefined}
        >
          <CodeArea
            label="Text to analyze"
            value={state.input}
            onValueChange={(input) => patch({ input })}
            softWrap
            acceptDrop
            placeholder="Paste or type text. Every count below updates live, so a long paste is debounced briefly to stay responsive."
          />
        </Panel>

        {!hasInput ? (
          <Panel>
            <EmptyState compact title="Nothing to analyze yet" mark={<IconLayers size={24} />}>
              Type or paste text above, or load the Sample to see counts, readability, and frequency
              tables all at once.
            </EmptyState>
          </Panel>
        ) : (
          <>
            <Panel label="Overview" padded>
              <StatGrid stats={headline} />
            </Panel>

            <Panel label="Detail" padded>
              <StatGrid stats={detail} />
            </Panel>

            <Panel label="Readability" padded>
              <StatGrid stats={readability} />
            </Panel>

            <div className={styles.tables}>
              <Panel label="Top words" status={pluralize(stats.wordFreq.length, 'word')}>
                {stats.wordFreq.length === 0 ? (
                  <EmptyState compact title="Nothing left after stopwords">
                    Turn on "Include stopwords" to see common words like "the" and "and".
                  </EmptyState>
                ) : (
                  <ul className={styles.freqList}>
                    {stats.wordFreq.map((f) => (
                      <li key={f.word} className={styles.freqRow}>
                        <span className={styles.freqWord}>{f.word}</span>
                        <span className={styles.freqBar}>
                          <span
                            className={styles.freqBarFill}
                            style={{ width: `${Math.min(100, f.percent * 2)}%` }}
                          />
                        </span>
                        <span className={styles.freqCount}>
                          {f.count} · {f.percent.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel label="Character frequency" status={pluralize(stats.charFreq.length, 'char')}>
                <ul className={styles.freqList}>
                  {stats.charFreq.map((f) => (
                    <li key={JSON.stringify(f.char)} className={styles.freqRow}>
                      <span className={styles.freqChar}>{describeChar(f.char)}</span>
                      <span className={styles.freqCount}>{f.count}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <Panel label="Character classes" padded>
              <StatGrid
                stats={[
                  { label: 'letters', value: stats.classes.letters.toLocaleString() },
                  { label: 'digits', value: stats.classes.digits.toLocaleString() },
                  { label: 'punctuation', value: stats.classes.punctuation.toLocaleString() },
                  { label: 'whitespace', value: stats.classes.whitespace.toLocaleString() },
                  { label: 'other', value: stats.classes.other.toLocaleString() },
                ]}
              />
            </Panel>

            <Panel label="Longest words">
              <div className={styles.chipRow}>
                {stats.longest.length === 0 ? (
                  <span className={styles.chipEmpty}>No words found.</span>
                ) : (
                  stats.longest.map((w) => (
                    <code key={w} className={styles.chip}>
                      {w} <span className={styles.chipLen}>{w.length}</span>
                    </code>
                  ))
                )}
              </div>
            </Panel>
          </>
        )}
      </PaneStack>
    </ToolShell>
  )
}

function describeChar(char: string): string {
  if (char === ' ') return '(space)'
  if (char === '\n') return '(newline)'
  if (char === '\t') return '(tab)'
  return char
}
