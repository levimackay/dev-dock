import { describe, expect, it } from 'vitest'
import {
  countWords,
  estimateReadingMinutes,
  prefixLines,
  renderMarkdown,
  wrapSelection,
} from './markdown'

/**
 * Parses rendered HTML into a detached element so tests can assert on the
 * actual DOM (attribute values, element presence) rather than substring
 * matching the HTML string — a substring check would pass a still-dangerous
 * payload that merely got reformatted, and would fail a safe payload that
 * happens to contain the same characters in inert text content.
 */
function parse(html: string): HTMLDivElement {
  const div = document.createElement('div')
  div.innerHTML = html
  return div
}

function hrefsIn(html: string): (string | null)[] {
  return Array.from(parse(html).querySelectorAll('[href]')).map((el) => el.getAttribute('href'))
}

describe('renderMarkdown — plain formatting', () => {
  it('renders headings, emphasis, and lists', () => {
    const html = renderMarkdown('# Title\n\n**bold** and *italic*\n\n- one\n- two')
    const div = parse(html)
    expect(div.querySelector('h1')?.textContent).toBe('Title')
    expect(div.querySelector('strong')?.textContent).toBe('bold')
    expect(div.querySelector('em')?.textContent).toBe('italic')
    expect(div.querySelectorAll('li')).toHaveLength(2)
  })

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(parse(html).querySelector('table')).not.toBeNull()
  })

  it('returns empty string for empty or whitespace-only input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown('   \n  ')).toBe('')
  })

  it('adds target and rel to a safe link', () => {
    const html = renderMarkdown('[go](https://example.com)')
    const a = parse(html).querySelector('a')
    expect(a?.getAttribute('href')).toBe('https://example.com')
    expect(a?.getAttribute('target')).toBe('_blank')
    expect(a?.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('respects the breaks option for soft line breaks', () => {
    const withBreaks = renderMarkdown('line one\nline two', { breaks: true })
    const withoutBreaks = renderMarkdown('line one\nline two', { breaks: false })
    expect(parse(withBreaks).querySelector('br')).not.toBeNull()
    expect(parse(withoutBreaks).querySelector('br')).toBeNull()
  })

  it('allows a raster data-URI image', () => {
    const html = renderMarkdown('![x](data:image/png;base64,iVBORw0KGgo=)')
    const img = parse(html).querySelector('img')
    expect(img?.getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})

describe('renderMarkdown — XSS resistance', () => {
  it('strips a <script> tag entirely, content included', () => {
    const html = renderMarkdown('before <script>alert(1)</script> after')
    expect(parse(html).querySelector('script')).toBeNull()
    expect(html).not.toContain('alert(1)')
  })

  it('strips onerror from an <img> tag', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    const img = parse(html).querySelector('img')
    expect(img?.hasAttribute('onerror')).toBe(false)
    expect(html).not.toContain('onerror')
  })

  it('strips a javascript: href written as a markdown link', () => {
    const html = renderMarkdown('[click](javascript:alert(1))')
    for (const href of hrefsIn(html)) expect(href).not.toMatch(/^javascript:/i)
  })

  it('strips a javascript: href written as raw HTML', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">click</a>')
    for (const href of hrefsIn(html)) expect(href).not.toMatch(/^javascript:/i)
  })

  it('removes an <iframe> entirely', () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>')
    expect(parse(html).querySelector('iframe')).toBeNull()
  })

  it('drops <svg> entirely, along with its event handlers', () => {
    // The sanitizer runs with the HTML profile only, so SVG never survives at
    // all rather than surviving with its attributes filtered. Markdown has no
    // use for it, and the HTML/SVG/MathML namespace boundary is where mutation
    // XSS bypasses have historically lived.
    const html = renderMarkdown('<svg onload="alert(1)"><circle r="1"/></svg>')
    expect(parse(html).querySelector('svg')).toBeNull()
    expect(html).not.toContain('onload')
  })

  it('drops MathML too', () => {
    const html = renderMarkdown(
      '<math><mtext><option><FAKE><mglyph>x</mglyph></FAKE></option></mtext></math>',
    )
    expect(parse(html).querySelector('math')).toBeNull()
  })

  it('strips a bare onmouseover attribute', () => {
    const html = renderMarkdown('<div onmouseover="alert(1)">hover</div>')
    const div = parse(html).querySelector('div')
    expect(div?.hasAttribute('onmouseover')).toBe(false)
    expect(html).not.toContain('onmouseover')
  })

  it('removes a <style> block, expression() included', () => {
    const html = renderMarkdown('<style>body{width:expression(alert(1))}</style>')
    expect(parse(html).querySelector('style')).toBeNull()
    expect(html).not.toContain('expression')
  })

  it('strips a data:text/html href', () => {
    const html = renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)')
    for (const href of hrefsIn(html)) expect(href).not.toMatch(/^data:text\/html/i)
  })

  it('strips an svg+xml data URI on an image (raster-only allowlist)', () => {
    const html = renderMarkdown('![x](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+)')
    const img = parse(html).querySelector('img')
    expect(img?.hasAttribute('src')).toBe(false)
  })

  it('strips a percent-encoded javascript: scheme', () => {
    const html = renderMarkdown('[x](%6a%61vascript:alert(1))')
    for (const href of hrefsIn(html)) {
      expect(href ?? '').not.toMatch(/^javascript:/i)
      // the raw encoded form must not survive as a usable href either
      expect(decodeURIComponent(href ?? '')).not.toMatch(/^javascript:/i)
    }
  })
})

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('returns 0 for empty or whitespace-only input', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
  })
})

describe('wrapSelection', () => {
  it('wraps a selection in before/after markers', () => {
    const result = wrapSelection('hello world', 6, 11, '**', '**', 'x')
    expect(result.value).toBe('hello **world**')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('world')
  })

  it('inserts and selects the placeholder for an empty selection', () => {
    const result = wrapSelection('hello ', 6, 6, '**', '**', 'bold text')
    expect(result.value).toBe('hello **bold text**')
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('bold text')
  })
})

describe('prefixLines', () => {
  it('prefixes a single line', () => {
    const result = prefixLines('hello', 0, 5, '## ')
    expect(result.value).toBe('## hello')
  })

  it('prefixes every line spanned by a multi-line selection', () => {
    const value = 'one\ntwo\nthree'
    const result = prefixLines(value, 0, value.length, '- ')
    expect(result.value).toBe('- one\n- two\n- three')
  })

  it('prefixes only the current line when the cursor has no selection', () => {
    const value = 'first\nsecond\nthird'
    const cursor = value.indexOf('second') + 3 // mid-word in the second line
    const result = prefixLines(value, cursor, cursor, '> ')
    expect(result.value).toBe('first\n> second\nthird')
  })
})

describe('estimateReadingMinutes', () => {
  it('returns 0 for no words', () => {
    expect(estimateReadingMinutes(0)).toBe(0)
  })

  it('rounds up to at least one minute for a short document', () => {
    expect(estimateReadingMinutes(10)).toBe(1)
  })

  it('scales with word count at the given reading speed', () => {
    expect(estimateReadingMinutes(1000, 200)).toBe(5)
  })
})

describe('CSS-driven exfiltration', () => {
  it('strips inline style attributes entirely', () => {
    const html = renderMarkdown(
      '<div style="background:url(https://tracker.example/beacon.png)">hi</div>',
    )
    expect(html).not.toContain('tracker.example')
    expect(html).not.toContain('style=')
  })

  it('strips a style attribute used to build a full-viewport overlay', () => {
    const html = renderMarkdown(
      '<a href="https://example.com" style="position:fixed;inset:0;z-index:9999">x</a>',
    )
    expect(html).not.toContain('position:fixed')
  })

  it('strips style from a table cell, where markdown itself emits alignment', () => {
    const html = renderMarkdown(
      '<td style="background-image:url(https://tracker.example/p)">c</td>',
    )
    expect(html).not.toContain('tracker.example')
  })
})
