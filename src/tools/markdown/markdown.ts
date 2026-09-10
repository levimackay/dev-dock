/**
 * Markdown -> sanitised HTML.
 *
 * This is the single most security-sensitive file in the app (see
 * SECURITY.md). `renderMarkdown` is the *only* function in the whole
 * codebase that is allowed to produce a string destined for
 * `dangerouslySetInnerHTML` — that happens exactly once, in
 * `MarkdownTool.tsx`, immediately downstream of this file's output.
 *
 * The pipeline is two independent stages, deliberately not merged into one:
 *
 *   1. `marked` turns Markdown text into HTML. It has no idea the HTML is
 *      about to be trusted, and it will happily emit a raw `<script>` tag if
 *      the source markdown contains one inline — Markdown has always allowed
 *      embedded HTML, and `marked` is right to pass it through unmodified.
 *   2. DOMPurify walks the resulting HTML and removes anything that is not
 *      on its allowlist: dangerous tags, event-handler attributes, and (via
 *      the hook below) dangerous URL schemes on `href`/`src`.
 *
 * Trusting `marked` alone would be a stored-XSS generator: paste someone
 * else's README, get their `<script>` tag executed on this app's origin.
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'

// ------------------------------------------------------------- URL scheme
// allowlist
//
// Applied to every `href` and `src` DOMPurify sees, via the
// `uponSanitizeAttribute` hook below rather than DOMPurify's own
// `ALLOWED_URI_REGEXP` — that option is a single regex applied uniformly to
// every URI attribute, which cannot express "allow `data:` here, but only
// for a handful of raster image MIME types." A hook can look at the value
// per-attribute and decide.

/**
 * Raster images only. `data:image/svg+xml` is deliberately *not* on this
 * list even though it is a common ask (and the task brief that prompted
 * this file even suggested it): an SVG document can itself carry a
 * `<script>` element or `on*` event-handler attributes. Browsers do not
 * execute those when the SVG is loaded through `<img src="data:...">` —
 * image context suppresses scripting — but that safety is a *rendering
 * context* nicety, not a property of the data itself. The identical data
 * URL pasted into a different context (an `<object>`, a direct navigation,
 * a different consumer of this sanitised HTML entirely) would execute it.
 * A markdown preview has no legitimate need for a scriptable image format,
 * so the simpler and strictly safer rule wins: raster only.
 */
const ALLOWED_DATA_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i

/**
 * True when a URL attribute value is one DOMPurify should strip.
 *
 * Two defensive details beyond a plain scheme check, both real bypass
 * techniques against naive filters:
 *
 * - **Control characters inside the scheme are stripped before matching**,
 *   because browsers do exactly this during URL parsing — `java\tscript:` or
 *   `java\nscript:` is treated as `javascript:` by the browser even though a
 *   literal substring check for `"javascript:"` would miss it.
 * - **The value is also checked after one `decodeURIComponent` pass**, to
 *   catch a percent-encoded scheme such as `%6a%61vascript:`. Modern
 *   browsers do not currently resolve that as `javascript:` (`%` is not a
 *   legal scheme character, so it parses as a relative path instead), but
 *   relying on that is relying on undocumented browser parsing behaviour
 *   rather than on a rule; decoding first makes the check correct regardless.
 */
function isDangerousUrl(rawValue: string): boolean {
  return [rawValue, safeDecode(rawValue)].some((value) => {
    const cleaned = value.replace(/[\t\n\r]/g, '').trim()
    const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned)
    if (!schemeMatch) return false // relative path, fragment, or no scheme at all — not a URL-scheme attack
    const scheme = schemeMatch[1]!.toLowerCase()
    if (scheme === 'javascript' || scheme === 'vbscript') return true
    if (scheme === 'data') return !ALLOWED_DATA_IMAGE_RE.test(cleaned)
    return false // http, https, mailto, tel, ftp, and anything else unrecognised: left alone
  })
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value // malformed percent-encoding — the raw check above still runs
  }
}

// DOMPurify hooks are registered once, at module scope: this file is
// imported exactly once by the app (the whole point of it being the only
// sanitisation call site), so there is no risk of the same hook stacking up
// on every render the way it would if this lived inside a component.

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if ((data.attrName === 'href' || data.attrName === 'src') && isDangerousUrl(data.attrValue)) {
    data.keepAttr = false
  }
})

// Every link a user clicks out of a rendered document they did not write
// should not hand the destination page a `window.opener` back into this
// app, and should not leak this app's URL as a `Referer`.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.hasAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

const SANITIZE_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOW_DATA_ATTR: false,

  // Markdown produces HTML. It never produces SVG or MathML, so both are
  // switched off rather than left in DOMPurify's default profile. Neither is
  // exploitable against the current version, but namespace confusion between
  // the HTML, SVG, and MathML parsers is where mutation-XSS bypasses have
  // historically been found, and a preview pane has no use for the surface.
  USE_PROFILES: { html: true },
  // DOMPurify already strips `<script>`, event-handler attributes, and
  // script-capable embedding tags by default — this list is redundant with
  // that default and kept anyway, as explicit, self-documenting intent
  // rather than a silent reliance on upstream defaults that could change.
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'base', 'form'],

  // `style` is the one attribute DOMPurify passes through by default that this
  // app cannot afford. DOMPurify sanitises *markup*, not CSS values, so
  // `<div style="background:url(https://tracker.example/x.png)">` survives
  // intact and fetches that URL the moment the preview renders. That is an
  // outbound request the user never composed, from a tool whose entire promise
  // is that nothing is transmitted; `position:fixed` overlays for phishing are
  // the same hole worn differently. Markdown has no legitimate need for inline
  // styles, so the attribute is simply removed.
  FORBID_ATTR: ['style'],
}

export interface RenderOptions {
  /** Soft line breaks in the source become `<br>`. GFM default is off. */
  breaks?: boolean
}

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  if (!source.trim()) return ''

  // `marked.parse` returns `string | Promise<string>` depending on whether
  // an async extension is registered — this file registers none, so the
  // synchronous path always applies. `async: false` in the options pins the
  // *type-level* overload to the synchronous one too, so this is a real
  // guarantee rather than a cast papering over the Promise case.
  const rawHtml = marked.parse(source, { gfm: true, breaks: options.breaks ?? false, async: false })

  return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG)
}

// ------------------------------------------------------- toolbar editing
//
// The formatting toolbar and its keyboard shortcuts both reduce to two
// primitive text edits — wrap the selection, or prefix each selected line —
// so both live here as pure functions on `(value, start, end)` rather than
// as event handlers reaching into a `<textarea>` directly. That is what
// makes them testable without mounting a component.

export interface SelectionEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

/** Wraps the current selection in `before`/`after` (bold, italic, code,
 *  links). An empty selection gets `placeholder` instead, pre-selected, so
 *  typing immediately replaces it — the same affordance as every rich-text
 *  editor's toolbar. */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): SelectionEdit {
  const selected = value.slice(start, end) || placeholder
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`
  const selectionStart = start + before.length
  return { value: next, selectionStart, selectionEnd: selectionStart + selected.length }
}

/** Prefixes every line touched by the current selection (headings, lists,
 *  blockquotes) — a multi-line selection gets the prefix on each of its
 *  lines, not just the first. */
export function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): SelectionEdit {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextNewline = value.indexOf('\n', end)
  const lineEnd = nextNewline === -1 ? value.length : nextNewline
  const block = value.slice(lineStart, lineEnd)
  const prefixed = block
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
  const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + prefixed.length }
}

// --------------------------------------------------------- panel metadata

/** A whitespace split. It counts Markdown punctuation (`#`, `*`, …) as part
 *  of adjacent words, which is imprecise but matches what every other "word
 *  count" tool people compare against actually does with raw source text. */
export function countWords(source: string): number {
  const trimmed = source.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/** Standard-ish reading-speed estimate, rounded up to at least one minute
 *  for any non-empty document. */
export function estimateReadingMinutes(words: number, wordsPerMinute = 200): number {
  return words === 0 ? 0 : Math.max(1, Math.round(words / wordsPerMinute))
}
