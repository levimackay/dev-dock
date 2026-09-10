/**
 * Rewrites spaced em dashes as ordinary punctuation.
 *
 * The em dash has become a reliable tell for machine-written prose, and this
 * repository is meant to read as a person's work. The transform is mechanical
 * but not blind:
 *
 *   - A dash after a short label that starts its own line becomes a colon.
 *     `- **Panel** — the only container` reads better as `Panel: the only
 *     container`.
 *   - Everything else becomes a comma. A paired dash (a parenthetical) turns
 *     into a pair of commas, which is grammatical English for an appositive.
 *   - A dash sitting at a line break keeps the break; only the punctuation
 *     changes.
 *
 * Standalone glyph uses (`'—'` as a placeholder in a table cell) are skipped.
 *
 * Run with `node scripts/dedash.mjs <files...>`; `--check` reports without
 * writing, which is what CI uses.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const DASH = /([ \t]*\n?[ \t]*)—([ \t]*\n?[ \t]*)/g

function isLabelPosition(before) {
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  // The dash must be the first punctuation on its own line, and the line must
  // begin a new thought: a list item, a heading, or the start of a paragraph.
  const previousLine = before.slice(0, Math.max(0, lineStart - 1))
  const previousEnds = /(^|[.:!?]|^\s*)$/.test(previousLine.split('\n').pop() ?? '')
  const isListOrHeading = /^\s*([-*+]|#{1,6}|\d+\.)\s/.test(line)
  if (!isListOrHeading && !previousEnds) return false

  const label = line.replace(/^\s*([-*+]|#{1,6}|\d+\.)\s*/, '').trim()
  if (label.includes(',') || label.includes(':')) return false
  return label.length > 0 && label.split(/\s+/).length <= 4
}

export function dedash(text) {
  return text.replace(DASH, (match, lead, trail, offset) => {
    const before = text.slice(0, offset)
    // A quoted lone glyph, e.g. return '—'
    if (/['"`]$/.test(before) && /^['"`]/.test(text.slice(offset + match.length))) return match
    // No whitespace on either side is a compound, not punctuation.
    if (lead === '' && trail === '') return match

    const punctuation = isLabelPosition(before) ? ':' : ','
    const trailingBreak = trail.includes('\n') ? trail : trail.replace(/^[ \t]*/, ' ')
    return punctuation + trailingBreak
  })
}

const args = process.argv.slice(2)
const check = args.includes('--check')
const files = args.filter((a) => !a.startsWith('--'))

let touched = 0
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const next = dedash(source)
  if (next === source) continue
  touched++
  if (check) console.log(`would rewrite ${file}`)
  else writeFileSync(file, next)
}

console.log(check ? `${touched} file(s) contain em dashes` : `rewrote ${touched} file(s)`)
if (check && touched > 0) process.exit(1)
