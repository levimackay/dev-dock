import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react'
import styles from './CodeArea.module.css'
import { cx } from '@/lib/cx'
import { formatBytes } from '@/lib/format'

export interface CodeAreaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  value: string
  onValueChange?: (value: string) => void
  /** Shows a synced line-number gutter. Off for prose, on for code. */
  lineNumbers?: boolean
  /** Soft-wraps instead of scrolling horizontally. */
  softWrap?: boolean
  /** Accepts dropped text files and reads them into the value. */
  acceptDrop?: boolean
  /** Refuses to read a dropped file larger than this. */
  maxDropBytes?: number
  label: string
}

const DEFAULT_MAX_DROP = 5 * 1024 * 1024

/**
 * The text surface every tool types into.
 *
 * It is a plain `<textarea>` on purpose. A real code editor (CodeMirror,
 * Monaco) would add 300 KB-1 MB to the bundle and bring its own accessibility
 * and mobile-keyboard quirks, in exchange for syntax colouring that none of
 * these tools actually need to do their job. What a textarea *does* lack is
 * tab-to-indent and a line gutter, so both are added here, about forty lines
 * against a megabyte.
 *
 * The gutter scrolls in lockstep with the textarea by mirroring `scrollTop`,
 * which is the standard trick and the reason both elements must share an
 * identical `line-height`.
 */
export const CodeArea = forwardRef<HTMLTextAreaElement, CodeAreaProps>(function CodeArea(
  {
    value,
    onValueChange,
    lineNumbers = false,
    softWrap = false,
    acceptDrop = false,
    maxDropBytes = DEFAULT_MAX_DROP,
    label,
    className,
    readOnly,
    spellCheck = false,
    onKeyDown,
    ...rest
  },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const [dropping, setDropping] = useState(false)
  const [dropError, setDropError] = useState<string | null>(null)
  const dropErrorTimer = useRef<number | undefined>(undefined)
  const id = useId()

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  const lineCount = lineNumbers ? countLines(value) : 0

  useEffect(() => () => window.clearTimeout(dropErrorTimer.current), [])

  useEffect(() => {
    const textarea = innerRef.current
    const gutter = gutterRef.current
    if (!textarea || !gutter) return
    const sync = () => {
      gutter.scrollTop = textarea.scrollTop
    }
    textarea.addEventListener('scroll', sync, { passive: true })
    return () => textarea.removeEventListener('scroll', sync)
  }, [lineNumbers])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || readOnly) return

    // Tab indents rather than moving focus. Escape restores tab-to-leave, so
    // keyboard users are never trapped in the editor.
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const el = event.currentTarget
      const { selectionStart, selectionEnd } = el
      event.preventDefault()
      if (event.shiftKey) {
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
        if (value.startsWith('  ', lineStart)) {
          const next = value.slice(0, lineStart) + value.slice(lineStart + 2)
          onValueChange?.(next)
          queueMicrotask(() => el.setSelectionRange(selectionStart - 2, selectionEnd - 2))
        }
        return
      }
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`
      onValueChange?.(next)
      queueMicrotask(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2))
    }
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange?.(event.target.value)
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (!acceptDrop || readOnly) return
    event.preventDefault()
    setDropping(false)
    const file = event.dataTransfer.files[0]
    if (!file) return

    // A cap that refuses in silence looks exactly like a broken drop target.
    // The message is rendered in the editor itself rather than raised to the
    // caller, so every tool that accepts a drop gets it without wiring.
    if (file.size > maxDropBytes) {
      setDropError(
        `${file.name} is ${formatBytes(file.size)}. Files above ${formatBytes(maxDropBytes)} are refused so the tab stays responsive.`,
      )
      window.clearTimeout(dropErrorTimer.current)
      dropErrorTimer.current = window.setTimeout(() => setDropError(null), 6000)
      return
    }

    setDropError(null)
    onValueChange?.(await file.text())
  }

  return (
    <div
      className={cx(styles.wrap, dropping && styles.dropping, className)}
      onDragOver={
        acceptDrop
          ? (e) => {
              e.preventDefault()
              setDropping(true)
            }
          : undefined
      }
      onDragLeave={acceptDrop ? () => setDropping(false) : undefined}
      onDrop={acceptDrop ? (e) => void handleDrop(e) : undefined}
    >
      {lineNumbers && (
        <div
          className={styles.gutter}
          ref={gutterRef}
          aria-hidden="true"
          title={
            lineCount > MAX_GUTTER_LINES
              ? `Line numbering stops at ${MAX_GUTTER_LINES.toLocaleString()}; this document has ${lineCount.toLocaleString()} lines.`
              : undefined
          }
        >
          {buildGutter(lineCount)}
        </div>
      )}
      {dropError && (
        <p className={styles.dropError} role="status">
          {dropError}
        </p>
      )}
      <textarea
        id={id}
        ref={setRefs}
        className={cx(styles.input, softWrap && styles.wrapped)}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label={label}
        spellCheck={spellCheck}
        readOnly={readOnly}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap={softWrap ? 'soft' : 'off'}
        {...rest}
      />
    </div>
  )
})

function countLines(value: string): number {
  let count = 1
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) count++
  return count
}

/** Capped so pasting a 500 k-line file cannot lock the main thread. */
const MAX_GUTTER_LINES = 20000

/**
 * Beyond the cap the gutter stops counting and says so with an ellipsis, rather
 * than silently continuing to look like a line number. Every other cap in the
 * app is visible where it bites; this one used to just stop.
 */
function buildGutter(lines: number): string {
  const shown = Math.min(lines, MAX_GUTTER_LINES)
  let out = ''
  for (let i = 1; i <= shown; i++) out += `${i}\n`
  if (lines > MAX_GUTTER_LINES) out += '…\n'
  return out
}
