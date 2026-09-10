/**
 * A diff engine, implementing Myers' O(ND) algorithm.
 *
 * ## Why write this rather than install `diff`
 *
 * The `diff` npm package is 30 KB and does considerably more than this app
 * needs (patch application, JSON diffing, five output formats). What Dev Dock
 * needs is the core sequence alignment plus line and word wrappers, which is
 * about 150 lines, and the algorithm is the single most interesting thing in
 * the codebase to read, so it is worth having in the repo.
 *
 * ## The algorithm, briefly
 *
 * Model the diff as a path through an (N+1)×(M+1) grid, from (0,0) to (N,M).
 * Moving right deletes from `a`; moving down inserts from `b`; moving
 * diagonally matches an element for free. The shortest edit script is the path
 * with the fewest non-diagonal moves, call that count D.
 *
 * Myers' insight is to search by increasing D rather than by position. For each
 * D, track only the furthest-reaching x on each diagonal k = x − y. That is one
 * array of at most 2D+1 entries per step, and the first time a diagonal reaches
 * (N,M) you have the optimal D. The cost is O((N+M)·D): linear when the inputs
 * are similar, which is the case that actually matters.
 *
 * ## The two guards
 *
 * 1. **Common prefix/suffix trimming.** Two 5,000-line files differing in one
 *    line have D=2 but the naive loop still walks the whole grid. Trimming the
 *    identical head and tail first makes that case effectively free.
 *
 * 2. **A ceiling on D.** Worst case (two completely unrelated inputs) is
 *    quadratic in time and memory, because the trace keeps every V array. Past
 *    `maxEditDistance` we bail out and return `null`; callers fall back to
 *    "everything replaced", which is both honest and cheap. Silently hanging
 *    the tab is the one outcome that is not acceptable.
 */

export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffChunk<T> {
  op: DiffOp
  values: T[]
}

const DEFAULT_MAX_D = 3000

/**
 * Aligns two sequences. Returns `null` when the edit distance exceeds
 * `maxEditDistance`, which the caller must handle.
 */
export function diffSequences<T>(
  a: readonly T[],
  b: readonly T[],
  maxEditDistance = DEFAULT_MAX_D,
): DiffChunk<T>[] | null {
  // ---- trim the identical head and tail -------------------------------
  let start = 0
  const limit = Math.min(a.length, b.length)
  while (start < limit && a[start] === b[start]) start++

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const head: DiffChunk<T>[] = start > 0 ? [{ op: 'equal', values: a.slice(0, start) }] : []
  const tail: DiffChunk<T>[] = endA < a.length ? [{ op: 'equal', values: a.slice(endA) }] : []

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)

  if (midA.length === 0 && midB.length === 0) return [...head, ...tail]
  if (midA.length === 0) return [...head, { op: 'insert', values: [...midB] }, ...tail]
  if (midB.length === 0) return [...head, { op: 'delete', values: [...midA] }, ...tail]

  const middle = myers(midA, midB, maxEditDistance)
  if (!middle) return null

  return compact([...head, ...middle, ...tail])
}

function myers<T>(a: readonly T[], b: readonly T[], maxD: number): DiffChunk<T>[] | null {
  const n = a.length
  const m = b.length
  const max = Math.min(n + m, maxD)
  const offset = max + 1

  // v[k + offset] = furthest x reached on diagonal k
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice())

    for (let k = -d; k <= d; k += 2) {
      const left = v[k - 1 + offset]!
      const right = v[k + 1 + offset]!

      // Choose the move that reaches further: down (insert) or right (delete).
      let x = k === -d || (k !== d && left < right) ? right : left + 1
      let y = x - k

      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }

      v[k + offset] = x

      if (x >= n && y >= m) return backtrack(a, b, trace, offset, d, k)
    }

    v = v.slice()
  }

  // Edit distance exceeded the ceiling.
  return null
}

function backtrack<T>(
  a: readonly T[],
  b: readonly T[],
  trace: Int32Array[],
  offset: number,
  finalD: number,
  finalK: number,
): DiffChunk<T>[] {
  const chunks: DiffChunk<T>[] = []
  let x = a.length
  let k = finalK

  for (let d = finalD; d > 0; d--) {
    const v = trace[d]!
    const left = v[k - 1 + offset]!
    const right = v[k + 1 + offset]!
    const cameFromRight = k === -d || (k !== d && left < right)

    const prevK = cameFromRight ? k + 1 : k - 1
    const prevX = cameFromRight ? right : left
    const prevY = prevX - prevK

    // The free diagonal run: every element matched between the predecessor's
    // position and where this step ended up. `x` is not decremented here
    // because it is overwritten with `prevX` a few lines below either way.
    const diagonal = x - (cameFromRight ? prevX : prevX + 1)
    if (diagonal > 0) chunks.push({ op: 'equal', values: a.slice(x - diagonal, x) })

    if (cameFromRight) chunks.push({ op: 'insert', values: [b[prevY]!] })
    else chunks.push({ op: 'delete', values: [a[prevX]!] })

    x = prevX
    k = prevK
  }

  if (x > 0) chunks.push({ op: 'equal', values: a.slice(0, x) })

  return compact(chunks.reverse())
}

/** Merges neighbouring chunks with the same op. */
function compact<T>(chunks: DiffChunk<T>[]): DiffChunk<T>[] {
  const out: DiffChunk<T>[] = []
  for (const chunk of chunks) {
    if (chunk.values.length === 0) continue
    const last = out[out.length - 1]
    if (last && last.op === chunk.op) last.values.push(...chunk.values)
    else out.push({ op: chunk.op, values: [...chunk.values] })
  }
  return out
}

// ---------------------------------------------------------------- lines

export interface LineDiffOptions {
  ignoreWhitespace?: boolean
  ignoreCase?: boolean
  maxEditDistance?: number
}

export interface DiffLine {
  op: DiffOp
  text: string
  /** 1-based line number in the left document, or null for an insertion. */
  leftNo: number | null
  /** 1-based line number in the right document, or null for a deletion. */
  rightNo: number | null
}

export function splitLines(text: string): string[] {
  if (text === '') return []
  return text.split(/\r\n|\r|\n/)
}

function normalizeLine(line: string, options: LineDiffOptions): string {
  let value = line
  if (options.ignoreWhitespace) value = value.trim().replace(/\s+/g, ' ')
  if (options.ignoreCase) value = value.toLowerCase()
  return value
}

export interface LineDiffResult {
  lines: DiffLine[]
  added: number
  removed: number
  unchanged: number
  /** True when the edit-distance ceiling was hit and the result is coarse. */
  degraded: boolean
}

export function diffLines(
  left: string,
  right: string,
  options: LineDiffOptions = {},
): LineDiffResult {
  const leftLines = splitLines(left)
  const rightLines = splitLines(right)

  // Compare on normalised keys but emit the original text, so "ignore
  // whitespace" changes what counts as equal without rewriting the user's file.
  const leftKeys = leftLines.map((line) => normalizeLine(line, options))
  const rightKeys = rightLines.map((line) => normalizeLine(line, options))

  const chunks = diffSequences(leftKeys, rightKeys, options.maxEditDistance)

  const lines: DiffLine[] = []
  let leftNo = 0
  let rightNo = 0
  let added = 0
  let removed = 0
  let unchanged = 0

  if (!chunks) {
    for (const text of leftLines)
      lines.push({ op: 'delete', text, leftNo: ++leftNo, rightNo: null })
    for (const text of rightLines)
      lines.push({ op: 'insert', text, leftNo: null, rightNo: ++rightNo })
    return {
      lines,
      added: rightLines.length,
      removed: leftLines.length,
      unchanged: 0,
      degraded: true,
    }
  }

  for (const chunk of chunks) {
    for (let i = 0; i < chunk.values.length; i++) {
      if (chunk.op === 'equal') {
        lines.push({
          op: 'equal',
          text: leftLines[leftNo] ?? '',
          leftNo: ++leftNo,
          rightNo: ++rightNo,
        })
        unchanged++
      } else if (chunk.op === 'delete') {
        lines.push({ op: 'delete', text: leftLines[leftNo] ?? '', leftNo: ++leftNo, rightNo: null })
        removed++
      } else {
        lines.push({
          op: 'insert',
          text: rightLines[rightNo] ?? '',
          leftNo: null,
          rightNo: ++rightNo,
        })
        added++
      }
    }
  }

  return { lines, added, removed, unchanged, degraded: false }
}

// ---------------------------------------------------------------- words

export interface WordSpan {
  op: DiffOp
  text: string
}

/**
 * Splits into words *and* the whitespace between them, both as tokens. Keeping
 * whitespace in the sequence means a diff that changes only spacing is visible
 * rather than silently dropped, and reassembling the output is a plain join.
 */
export function tokenizeWords(text: string): string[] {
  return text.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? []
}

/** Word-level diff of two single lines, used to highlight inside a changed row. */
export function diffWords(left: string, right: string): WordSpan[] {
  const chunks = diffSequences(tokenizeWords(left), tokenizeWords(right), 500)
  if (!chunks) {
    return [
      { op: 'delete', text: left },
      { op: 'insert', text: right },
    ]
  }
  return chunks.map((chunk) => ({ op: chunk.op, text: chunk.values.join('') }))
}

// -------------------------------------------------------- unified patch

/**
 * Renders a unified diff: the format `patch` and `git apply` read.
 *
 * Three details separate a patch that applies from a string that merely looks
 * like one, and the first version of this function got all three wrong.
 *
 * 1. **The phantom trailing line.** `splitLines("a\nb\nc\n")` yields
 *    `['a','b','c','']`, because the text really does have an empty string
 *    after the final newline. That is the right model for an editor, and the
 *    wrong one for a patch: `diff -u` reports three lines, not four, so a hunk
 *    header counting the phantom is off by one and git refuses the patch.
 *    The trailing newline is therefore stripped before diffing and recorded as
 *    a flag instead.
 *
 * 2. **`\ No newline at end of file`.** When a side does *not* end in a
 *    newline, the format says so explicitly after the last line it contributes.
 *    Without the marker git assumes a newline is there, the context fails to
 *    match, and the patch is rejected.
 *
 * 3. **The trailing newline on the patch itself.** A patch that does not end
 *    with one is "corrupt patch at line N" before git looks at the content.
 */
export function toUnifiedDiff(
  left: string,
  right: string,
  options: { leftName?: string; rightName?: string; context?: number } & LineDiffOptions = {},
): string {
  const { leftName = 'a', rightName = 'b', context = 3 } = options

  const leftEndsWithEol = left === '' || left.endsWith('\n')
  const rightEndsWithEol = right === '' || right.endsWith('\n')
  const leftBody = leftEndsWithEol && left !== '' ? left.slice(0, -1) : left
  const rightBody = rightEndsWithEol && right !== '' ? right.slice(0, -1) : right

  const { lines } = diffLines(leftBody, rightBody, options)

  // Adding or removing the final newline changes no *line*, so the diff above
  // sees two identical files. `diff -u` handles this by rewriting the last line
  // as a delete plus an insert of the same text, differing only in the marker
  // that follows. Do the same, or the patch has a header and no hunks and git
  // reports "No valid patches in input".
  if (leftEndsWithEol !== rightEndsWithEol) {
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!
      if (line.op !== 'equal') break
      lines.splice(
        i,
        1,
        { op: 'delete', text: line.text, leftNo: line.leftNo, rightNo: null },
        { op: 'insert', text: line.text, leftNo: null, rightNo: line.rightNo },
      )
      break
    }
  }

  if (lines.every((line) => line.op === 'equal')) return ''

  // The last line each side contributes: where a "no newline" marker belongs.
  let lastLeftIndex = -1
  let lastRightIndex = -1
  for (const [i, line] of lines.entries()) {
    if (line.leftNo !== null) lastLeftIndex = i
    if (line.rightNo !== null) lastRightIndex = i
  }

  // Group changed lines into hunks, padding each with `context` equal lines and
  // merging hunks that would otherwise overlap.
  const changedAt = lines.map((line) => line.op !== 'equal')
  const hunks: Array<{ start: number; end: number }> = []

  for (let i = 0; i < lines.length; i++) {
    if (!changedAt[i]) continue
    const start = Math.max(0, i - context)
    const end = Math.min(lines.length - 1, i + context)
    const last = hunks[hunks.length - 1]
    if (last && start <= last.end + 1) last.end = Math.max(last.end, end)
    else hunks.push({ start, end })
  }

  const out: string[] = [`--- ${leftName}`, `+++ ${rightName}`]

  for (const hunk of hunks) {
    const slice = lines.slice(hunk.start, hunk.end + 1)
    const leftCount = slice.filter((l) => l.leftNo !== null).length
    const rightCount = slice.filter((l) => l.rightNo !== null).length
    // An empty side is written as `0,0` starting at line 0, which is what
    // `diff -u` emits when a hunk only inserts or only deletes.
    const leftStart = leftCount === 0 ? 0 : (slice.find((l) => l.leftNo !== null)?.leftNo ?? 0)
    const rightStart = rightCount === 0 ? 0 : (slice.find((l) => l.rightNo !== null)?.rightNo ?? 0)

    out.push(`@@ -${leftStart},${leftCount} +${rightStart},${rightCount} @@`)

    for (const [offset, line] of slice.entries()) {
      const index = hunk.start + offset
      const marker = line.op === 'equal' ? ' ' : line.op === 'delete' ? '-' : '+'
      out.push(marker + line.text)

      // The marker follows the line it describes. A context line belongs to
      // both sides, so it needs the marker only once even if neither side ends
      // in a newline.
      const leftNeedsMarker = !leftEndsWithEol && index === lastLeftIndex && line.leftNo !== null
      const rightNeedsMarker =
        !rightEndsWithEol && index === lastRightIndex && line.rightNo !== null
      if (leftNeedsMarker || rightNeedsMarker) out.push('\\ No newline at end of file')
    }
  }

  return `${out.join('\n')}\n`
}
