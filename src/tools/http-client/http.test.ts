import { describe, expect, it } from 'vitest'
import {
  contentTypeForBody,
  explainFetchFailure,
  headersToObject,
  isForbiddenHeader,
  parseQueryParams,
  prettyPrintIfJson,
  toCurl,
  withQueryParams,
  type KeyValueRow,
} from './http'

describe('contentTypeForBody', () => {
  it('has no content-type for an empty body', () => {
    expect(contentTypeForBody('none', '')).toBeUndefined()
  })

  it('follows the body mode', () => {
    expect(contentTypeForBody('json', '')).toBe('application/json')
    expect(contentTypeForBody('form', '')).toBe('application/x-www-form-urlencoded')
  })

  it('uses the user-supplied content-type for raw, defaulting to text/plain', () => {
    expect(contentTypeForBody('raw', 'application/xml')).toBe('application/xml')
    expect(contentTypeForBody('raw', '')).toBe('text/plain')
  })
})

describe('isForbiddenHeader', () => {
  it('flags the well-known forbidden headers, case-insensitively', () => {
    expect(isForbiddenHeader('Host')).toBe(true)
    expect(isForbiddenHeader('origin')).toBe(true)
    expect(isForbiddenHeader('COOKIE')).toBe(true)
    expect(isForbiddenHeader('Referer')).toBe(true)
  })

  it('flags Proxy- and Sec- prefixed headers', () => {
    expect(isForbiddenHeader('Proxy-Authorization')).toBe(true)
    expect(isForbiddenHeader('Sec-Fetch-Mode')).toBe(true)
  })

  it('does not flag an ordinary header', () => {
    expect(isForbiddenHeader('Authorization')).toBe(false)
    expect(isForbiddenHeader('X-Api-Key')).toBe(false)
  })
})

describe('headersToObject', () => {
  it('keeps only enabled rows with a non-blank key', () => {
    const rows: KeyValueRow[] = [
      { key: 'Authorization', value: 'Bearer x', enabled: true },
      { key: 'X-Disabled', value: 'nope', enabled: false },
      { key: '  ', value: 'blank key', enabled: true },
    ]
    expect(headersToObject(rows)).toEqual({ Authorization: 'Bearer x' })
  })
})

describe('parseQueryParams / withQueryParams', () => {
  it('reads params from a URL', () => {
    expect(parseQueryParams('https://example.com/a?x=1&y=2')).toEqual([
      { key: 'x', value: '1', enabled: true },
      { key: 'y', value: '2', enabled: true },
    ])
  })

  it('returns empty for an unparsable URL', () => {
    expect(parseQueryParams('not a url')).toEqual([])
  })

  it('rewrites the query string from a row list', () => {
    const rows: KeyValueRow[] = [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: true },
    ]
    expect(withQueryParams('https://example.com/path', rows)).toBe(
      'https://example.com/path?a=1&b=2',
    )
  })

  it('skips disabled or blank-key rows when rebuilding', () => {
    const rows: KeyValueRow[] = [
      { key: 'a', value: '1', enabled: true },
      { key: 'b', value: '2', enabled: false },
      { key: '', value: '3', enabled: true },
    ]
    expect(withQueryParams('https://example.com/path', rows)).toBe('https://example.com/path?a=1')
  })
})

describe('toCurl', () => {
  it('builds a basic GET command', () => {
    expect(toCurl({ method: 'GET', url: 'https://example.com', headers: [] })).toBe(
      "curl -X 'GET' 'https://example.com'",
    )
  })

  it('includes enabled headers only', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [
        { key: 'Authorization', value: 'Bearer abc', enabled: true },
        { key: 'X-Off', value: 'nope', enabled: false },
      ],
    })
    expect(curl).toContain("-H 'Authorization: Bearer abc'")
    expect(curl).not.toContain('X-Off')
  })

  it('quotes a body containing a single quote correctly', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      body: `{"name":"O'Brien"}`,
    })
    // The escape sequence is: close quote, escaped literal quote, reopen quote.
    expect(curl).toContain(`--data-raw '{"name":"O'\\''Brien"}'`)
  })

  it('quotes a body with multiple quotes, each escaped independently', () => {
    const curl = toCurl({
      method: 'POST',
      url: 'https://example.com',
      headers: [],
      body: `'a' and 'b'`,
    })
    expect(curl).toContain(`--data-raw ''\\''a'\\'' and '\\''b'\\'''`)
  })

  it('omits --data-raw when there is no body', () => {
    expect(toCurl({ method: 'GET', url: 'https://example.com', headers: [] })).not.toContain(
      '--data-raw',
    )
  })
})

describe('prettyPrintIfJson', () => {
  it('pretty-prints a JSON body declared by content-type', () => {
    expect(prettyPrintIfJson('{"a":1}', 'application/json')).toBe('{\n  "a": 1\n}')
  })

  it('pretty-prints JSON-shaped text even without a matching content-type', () => {
    expect(prettyPrintIfJson('{"a":1}', 'text/plain')).toBe('{\n  "a": 1\n}')
  })

  it('leaves non-JSON text alone', () => {
    expect(prettyPrintIfJson('hello world', 'text/plain')).toBe('hello world')
  })

  it('leaves malformed JSON-shaped text alone rather than throwing', () => {
    expect(prettyPrintIfJson('{not json}', 'application/json')).toBe('{not json}')
  })

  it('returns empty input unchanged', () => {
    expect(prettyPrintIfJson('', 'application/json')).toBe('')
  })
})

describe('explainFetchFailure', () => {
  const page = 'https://devdock.example/tools/http-client'

  it('reports a timeout when the caller flags one', () => {
    const msg = explainFetchFailure(new Error('irrelevant'), 'https://api.example.com', page, {
      timedOut: true,
    })
    expect(msg).toMatch(/timed out/i)
  })

  it('reports cancellation for an AbortError', () => {
    const msg = explainFetchFailure(
      new DOMException('aborted', 'AbortError'),
      'https://api.example.com',
      page,
    )
    expect(msg).toMatch(/cancelled/i)
  })

  it('names an invalid URL', () => {
    const msg = explainFetchFailure(new TypeError('Failed to fetch'), 'not a url', page)
    expect(msg).toMatch(/not a valid url/i)
  })

  it('names an unsupported scheme', () => {
    const msg = explainFetchFailure(
      new TypeError('Failed to fetch'),
      'ftp://example.com/file',
      page,
    )
    expect(msg).toMatch(/ftp:.*not something a browser/i)
  })

  it('detects mixed content — https page, http target', () => {
    const msg = explainFetchFailure(
      new TypeError('Failed to fetch'),
      'http://api.example.com',
      page,
    )
    expect(msg).toMatch(/mixed content/i)
  })

  it('flags a likely CORS block for a same-scheme cross-origin request', () => {
    const msg = explainFetchFailure(
      new TypeError('Failed to fetch'),
      'https://api.other.example',
      page,
    )
    expect(msg).toMatch(/cors/i)
    expect(msg).toContain('https://api.other.example')
    expect(msg).toContain('https://devdock.example')
  })

  it('falls back to a generic DNS/connection explanation for a same-origin failure', () => {
    const msg = explainFetchFailure(
      new TypeError('Failed to fetch'),
      'https://devdock.example/api',
      page,
    )
    expect(msg).toMatch(/dns|connection/i)
    expect(msg).not.toMatch(/cors/i)
  })
})
