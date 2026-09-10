import { describe, expect, it } from 'vitest'
import { escapeHtml, unescapeHtml } from './entities'

describe('escapeHtml', () => {
  it('minimal mode escapes only the five structural characters', () => {
    expect(escapeHtml(`<a href="x">it's ok & fine</a>`, 'minimal')).toBe(
      '&lt;a href=&quot;x&quot;&gt;it&#39;s ok &amp; fine&lt;/a&gt;',
    )
  })

  it('minimal mode leaves other Unicode alone', () => {
    expect(escapeHtml('café — 🌍', 'minimal')).toBe('café — 🌍')
  })

  it('named mode uses a named entity where one is available', () => {
    expect(escapeHtml('café — “quote”', 'named')).toBe('caf&eacute; &mdash; &ldquo;quote&rdquo;')
  })

  it('named mode falls back to the literal character when no name exists', () => {
    expect(escapeHtml('🌍', 'named')).toBe('🌍')
  })

  it('numeric mode escapes every non-ASCII character as &#xHEX;', () => {
    expect(escapeHtml('café', 'numeric')).toBe('caf&#xE9;')
  })

  it('numeric mode handles an astral character as one reference, not two', () => {
    // 🌍 is U+1F30D, outside the BMP — a naive UTF-16 loop would see two
    // surrogate code units and emit two broken references.
    expect(escapeHtml('🌍', 'numeric')).toBe('&#x1F30D;')
  })

  it('returns empty for empty input', () => {
    expect(escapeHtml('', 'minimal')).toBe('')
  })

  it('always escapes the five structural characters regardless of mode', () => {
    expect(escapeHtml('<>&', 'numeric')).toBe('&lt;&gt;&amp;')
  })
})

describe('unescapeHtml', () => {
  it('decodes minimal named entities', () => {
    expect(unescapeHtml('&lt;a&gt; &amp; &quot;b&quot; &#39;c&#39;')).toBe(`<a> & "b" 'c'`)
  })

  it('decodes decimal numeric references', () => {
    expect(unescapeHtml('&#233;')).toBe('é')
  })

  it('decodes hex numeric references, case-insensitively', () => {
    expect(unescapeHtml('&#xE9; &#Xe9;')).toBe('é é')
  })

  it('decodes an astral numeric reference back to one character', () => {
    expect(unescapeHtml('&#x1F30D;')).toBe('🌍')
  })

  it('decodes a wide named-entity table entry', () => {
    expect(unescapeHtml('&hearts; &euro;10 &copy; 2026')).toBe('♥ €10 © 2026')
  })

  it('leaves an unrecognised named entity untouched rather than guessing', () => {
    expect(unescapeHtml('&notarealentity; text')).toBe('&notarealentity; text')
  })

  it('leaves a malformed reference (missing semicolon) untouched', () => {
    expect(unescapeHtml('AT&T')).toBe('AT&T')
  })

  it('leaves a reference with no digits untouched', () => {
    expect(unescapeHtml('&#;')).toBe('&#;')
  })

  it('never throws on a lone surrogate reference, and leaves it untouched', () => {
    expect(() => unescapeHtml('&#xD800;')).not.toThrow()
    expect(unescapeHtml('&#xD800;')).toBe('&#xD800;')
  })

  it('never throws on an out-of-range numeric reference', () => {
    expect(() => unescapeHtml('&#99999999;')).not.toThrow()
    expect(unescapeHtml('&#99999999;')).toBe('&#99999999;')
  })

  it('returns empty for empty input', () => {
    expect(unescapeHtml('')).toBe('')
  })

  it('round-trips arbitrary text through escape and unescape', () => {
    const text = `<script>alert('hi & bye')</script> café 🌍`
    expect(unescapeHtml(escapeHtml(text, 'numeric'))).toBe(text)
  })

  it('does not execute or interpret markup — it only substitutes text', () => {
    // The whole point of hand-parsing instead of innerHTML: this must come
    // back as inert text, never be parsed as a tag.
    const result = unescapeHtml('&lt;img src=x onerror=alert(1)&gt;')
    expect(result).toBe('<img src=x onerror=alert(1)>')
    expect(typeof result).toBe('string')
  })
})
