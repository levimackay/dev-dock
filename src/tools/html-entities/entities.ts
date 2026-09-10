/**
 * HTML entity escaping and unescaping.
 *
 * The wrong way to write "unescape HTML entities" is `el.innerHTML = input;
 * return el.textContent`. It looks elegant and it is an XSS sink: assigning
 * to `innerHTML` PARSES the string as HTML, so `<img src=x onerror=alert(1)>`
 * runs its handler the moment it is assigned, entities or not. That the tool
 * only reads `.textContent` back afterwards does not help — the damage (script
 * execution, in a "trusted" dev tool a user might paste secrets into) already
 * happened during assignment. The only safe way to decode entities is to
 * *not parse HTML at all*: walk the string, recognise `&name;` / `&#123;` /
 * `&#x7B;` forms with an explicit grammar, and substitute characters. That is
 * what this file does.
 */

export type EscapeMode = 'minimal' | 'named' | 'numeric'

/** The five characters that are structurally significant in HTML text/attributes. */
const MINIMAL_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Named entities worth recognising both ways. This is deliberately a few
 * hundred common entries, not the ~2,200-entry HTML5 named-character-
 * reference table — the long tail (`&NotNestedGreaterGreater;` and friends)
 * is real but essentially never appears outside a spec-compliance test, and
 * shipping it as a giant literal would defeat the point of a hand-reviewable
 * tool. Anything not in this table still round-trips correctly through the
 * numeric-reference path.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  dagger: '†',
  Dagger: '‡',
  permil: '‰',
  euro: '€',
  pound: '£',
  cent: '¢',
  yen: '¥',
  sect: '§',
  para: '¶',
  middot: '·',
  deg: '°',
  plusmn: '±',
  times: '×',
  divide: '÷',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  sup1: '¹',
  sup2: '²',
  sup3: '³',
  micro: 'µ',
  ordf: 'ª',
  ordm: 'º',
  laquo: '«',
  raquo: '»',
  iquest: '¿',
  iexcl: '¡',
  szlig: 'ß',
  agrave: 'à',
  aacute: 'á',
  acirc: 'â',
  atilde: 'ã',
  auml: 'ä',
  aring: 'å',
  aelig: 'æ',
  ccedil: 'ç',
  egrave: 'è',
  eacute: 'é',
  ecirc: 'ê',
  euml: 'ë',
  igrave: 'ì',
  iacute: 'í',
  icirc: 'î',
  iuml: 'ï',
  ntilde: 'ñ',
  ograve: 'ò',
  oacute: 'ó',
  ocirc: 'ô',
  otilde: 'õ',
  ouml: 'ö',
  oslash: 'ø',
  ugrave: 'ù',
  uacute: 'ú',
  ucirc: 'û',
  uuml: 'ü',
  yacute: 'ý',
  yuml: 'ÿ',
  Agrave: 'À',
  Aacute: 'Á',
  Acirc: 'Â',
  Atilde: 'Ã',
  Auml: 'Ä',
  Aring: 'Å',
  AElig: 'Æ',
  Ccedil: 'Ç',
  Egrave: 'È',
  Eacute: 'É',
  Ecirc: 'Ê',
  Euml: 'Ë',
  Igrave: 'Ì',
  Iacute: 'Í',
  Icirc: 'Î',
  Iuml: 'Ï',
  Ntilde: 'Ñ',
  Ograve: 'Ò',
  Oacute: 'Ó',
  Ocirc: 'Ô',
  Otilde: 'Õ',
  Ouml: 'Ö',
  Oslash: 'Ø',
  Ugrave: 'Ù',
  Uacute: 'Ú',
  Ucirc: 'Û',
  Uuml: 'Ü',
  Yacute: 'Ý',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  pi: 'π',
  sigma: 'σ',
  omega: 'ω',
  Alpha: 'Α',
  Beta: 'Β',
  Gamma: 'Γ',
  Delta: 'Δ',
  Omega: 'Ω',
  infin: '∞',
  ne: '≠',
  le: '≤',
  ge: '≥',
  larr: '←',
  uarr: '↑',
  rarr: '→',
  darr: '↓',
  harr: '↔',
  spades: '♠',
  clubs: '♣',
  hearts: '♥',
  diams: '♦',
}

/** Reverse lookup, built once. First name wins on a collision (there are none above). */
const CHAR_TO_NAME: Record<string, string> = {}
for (const [name, char] of Object.entries(NAMED_ENTITIES)) {
  if (!(char in CHAR_TO_NAME)) CHAR_TO_NAME[char] = name
}

/** True for the ASCII printable range — everything else is "non-ASCII" for escape purposes. */
function isAscii(char: string): boolean {
  const code = char.codePointAt(0) ?? 0
  return code < 0x80
}

export function escapeHtml(text: string, mode: EscapeMode): string {
  if (text === '') return ''

  let out = ''
  // Iterate by code point, not by UTF-16 code unit, so a surrogate pair
  // (anything outside the Basic Multilingual Plane, e.g. most emoji) is
  // treated as the one character it is, not two lone surrogates that would
  // each numeric-escape to a broken reference.
  for (const char of text) {
    if (char in MINIMAL_ESCAPES) {
      out += MINIMAL_ESCAPES[char]
      continue
    }
    if (mode === 'minimal') {
      out += char
      continue
    }
    if (mode === 'named') {
      const name = CHAR_TO_NAME[char]
      out += name ? `&${name};` : char
      continue
    }
    // mode === 'numeric': every non-ASCII character becomes &#xHEX;
    if (!isAscii(char)) {
      out += `&#x${(char.codePointAt(0) ?? 0).toString(16).toUpperCase()};`
    } else {
      out += char
    }
  }
  return out
}

/**
 * Matches `&name;`, `&#123;`, and `&#x1F30D;` — the three reference forms
 * HTML actually defines. Unknown or malformed references are left untouched
 * rather than guessed at or dropped, which is both safer (nothing
 * disappears silently) and matches how a browser's text-content parser
 * behaves for an unrecognised named reference.
 */
const ENTITY_RE = /&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g

export function unescapeHtml(text: string): string {
  if (text === '') return ''

  return text.replace(ENTITY_RE, (match, body: string) => {
    if (body[0] === '#') {
      const isHex = body[1] === 'x' || body[1] === 'X'
      const digits = isHex ? body.slice(2) : body.slice(1)
      const codePoint = parseInt(digits, isHex ? 16 : 10)
      return isValidReference(codePoint) ? safeFromCodePoint(codePoint) : match
    }
    const named = NAMED_ENTITIES[body]
    return named ?? match // unrecognised name: leave it exactly as written
  })
}

/** Rejects the code points the HTML spec also rejects: surrogates and out-of-range values. */
function isValidReference(codePoint: number): boolean {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return false
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false // lone surrogate
  return true
}

/** `String.fromCodePoint` throws on a handful of edge values; never let a decode crash the tool. */
function safeFromCodePoint(codePoint: number): string {
  try {
    return String.fromCodePoint(codePoint === 0 ? 0xfffd : codePoint)
  } catch {
    return '�'
  }
}
