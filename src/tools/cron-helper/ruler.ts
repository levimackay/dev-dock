/**
 * Locates each field of a raw cron expression by character offset, so the UI
 * can draw a label directly above the substring the user actually typed —
 * the "live field ruler" that is this tool's signature feature.
 *
 * The trick that makes this simple: both the ruler and the input below it are
 * rendered in the same monospace font, so a label only needs `left: ${n}ch` —
 * CSS's `ch` unit is exactly one monospace character wide — rather than any
 * JS-side pixel measurement of the rendered text.
 */

export interface FieldToken {
  /** Character offset of the token's first character in the raw string. */
  start: number
  /** Character offset one past the token's last character. */
  end: number
  text: string
}

/** Splits on whitespace runs of any width, keeping each token's real offset — so extra spaces between fields (or a leading one) do not shift the ruler off. */
export function tokenizeCronInput(raw: string): FieldToken[] {
  const tokens: FieldToken[] = []
  const pattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw))) {
    tokens.push({ start: match.index, end: match.index + match[0].length, text: match[0] })
  }
  return tokens
}

const FIVE_FIELD_NAMES = ['minute', 'hour', 'day of month', 'month', 'day of week']
const SIX_FIELD_NAMES = ['second', ...FIVE_FIELD_NAMES]

export interface LabelledToken extends FieldToken {
  field: string
}

/**
 * Pairs each token with its field name for a standard 5-field expression or a
 * 6-field one with a leading seconds column. Any other token count (a macro's
 * single `@daily`, or a malformed expression `parseCron` will itself reject)
 * has nothing sensible to label, so it returns an empty ruler rather than
 * guessing.
 */
export function labelCronTokens(tokens: FieldToken[]): LabelledToken[] {
  const names = tokens.length === 6 ? SIX_FIELD_NAMES : tokens.length === 5 ? FIVE_FIELD_NAMES : undefined
  if (!names) return []
  return tokens.map((token, i) => ({ ...token, field: names[i]! }))
}
