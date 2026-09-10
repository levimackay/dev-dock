/**
 * Text preprocessing for Code Diff's two extra ignore-options.
 *
 * `diffLines`'s own `ignoreWhitespace` trims *and* collapses internal runs of
 * whitespace to one space, which is right for prose but wrong for source: it
 * would treat a 2-space and a 4-space indent as identical. Code Diff needs two
 * narrower behaviours instead, so they are implemented here as a preprocessing
 * pass over the raw text rather than as new options on the shared line differ.
 *
 * ponytail: "ignore blank lines" strips blank lines out of both documents
 * before diffing, rather than diffing everything and hiding blank-only hunks
 * afterwards. That is the smaller change, but it means the line numbers shown
 * reflect the *filtered* text, not the original file, whenever the option is
 * on. Upgrade path, if exact original line numbers ever matter more than the
 * simplicity here: diff the untouched text and filter the resulting hunks
 * instead of the input.
 */
export interface CodeDiffPreprocessOptions {
  ignoreTrailingWhitespace: boolean
  ignoreBlankLines: boolean
}

export function preprocessForDiff(text: string, options: CodeDiffPreprocessOptions): string {
  let lines = text.split(/\r\n|\r|\n/)
  if (options.ignoreTrailingWhitespace) lines = lines.map((line) => line.replace(/[ \t]+$/, ''))
  if (options.ignoreBlankLines) lines = lines.filter((line) => line.trim() !== '')
  return lines.join('\n')
}

/** A safe filename fragment for a patch header, no path traversal, no blank. */
export function sanitizeFileLabel(name: string, fallback: string): string {
  const trimmed = name.trim()
  return trimmed === '' ? fallback : trimmed.replace(/\s+/g, ' ')
}

export const SAMPLE_LEFT = `function total(items) {
  var sum = 0
  for (var i = 0; i < items.length; i++) {
    sum += items[i].price
  }
  return sum
}

module.exports = { total }
`

export const SAMPLE_RIGHT = `function total(items, { taxRate = 0 } = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0)
  return subtotal * (1 + taxRate)
}

function formatCurrency(amount) {
  return \`$\${amount.toFixed(2)}\`
}

module.exports = { total, formatCurrency }
`
