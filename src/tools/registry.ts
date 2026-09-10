import { lazy } from 'react'
import type { ToolCategory, ToolCategoryId, ToolDefinition } from './types'

/**
 * The tool registry: the single source of truth for what Dev Dock contains.
 *
 * Every entry is `lazy()`, so Rollup emits one chunk per tool and the initial
 * download is the shell plus whichever tool you actually opened. The metadata
 * (name, keywords, category) is plain data in this module, which means the
 * command palette and global search can rank all 22 tools without pulling a
 * single tool's implementation into memory.
 */

export const CATEGORIES: ToolCategory[] = [
  { id: 'data', label: 'Data', blurb: 'Read, reshape, and sanity-check structured payloads.' },
  {
    id: 'encoding',
    label: 'Encoding',
    blurb: 'Move bytes between the representations wires want.',
  },
  { id: 'text', label: 'Text', blurb: 'Compare, transform, and measure prose and source.' },
  { id: 'time', label: 'Time', blurb: 'Translate between the many ways machines write a moment.' },
  { id: 'web', label: 'Web', blurb: 'Inspect the pieces of a request, a URL, and a colour.' },
  {
    id: 'generate',
    label: 'Generate',
    blurb: 'Produce identifiers and filler that look real enough.',
  },
]

export const TOOLS: ToolDefinition[] = [
  // ---- data ------------------------------------------------------------
  {
    id: 'json-formatter',
    name: 'JSON Formatter',
    short: 'Pretty-print, minify, and validate JSON with precise error positions.',
    category: 'data',
    keywords: ['json', 'format', 'beautify', 'pretty', 'minify', 'validate', 'lint', 'sort keys'],
    Component: lazy(() => import('./json-formatter/JsonFormatterTool')),
  },
  {
    id: 'json-tree',
    name: 'JSON Tree Viewer',
    short: 'Explore large documents as a collapsible tree with JSONPath filtering.',
    category: 'data',
    keywords: ['json', 'tree', 'viewer', 'explore', 'jsonpath', 'query', 'collapse', 'navigate'],
    Component: lazy(() => import('./json-tree/JsonTreeTool')),
  },
  {
    id: 'sql-formatter',
    name: 'SQL Formatter',
    short: 'Format SQL for twenty dialects, with keyword casing and indent control.',
    category: 'data',
    keywords: ['sql', 'format', 'beautify', 'postgres', 'mysql', 'sqlite', 'bigquery', 'query'],
    Component: lazy(() => import('./sql-formatter/SqlFormatterTool')),
  },

  // ---- encoding --------------------------------------------------------
  {
    id: 'base64',
    name: 'Base64',
    short: 'Encode and decode Base64 and Base64URL, text or binary, either way.',
    category: 'encoding',
    keywords: ['base64', 'b64', 'encode', 'decode', 'atob', 'btoa', 'data uri', 'binary'],
    Component: lazy(() => import('./base64/Base64Tool')),
  },
  {
    id: 'url-encoder',
    name: 'URL Encoder',
    short: 'Percent-encode and decode, for whole URLs or single components.',
    category: 'encoding',
    keywords: ['url', 'uri', 'percent', 'encode', 'decode', 'escape', 'query string', 'encodeuri'],
    Component: lazy(() => import('./url-encoder/UrlEncoderTool')),
  },
  {
    id: 'html-entities',
    name: 'HTML Entities',
    short: 'Escape and unescape HTML entities, named or numeric.',
    category: 'encoding',
    keywords: ['html', 'entity', 'entities', 'escape', 'unescape', 'xml', 'amp', 'nbsp'],
    Component: lazy(() => import('./html-entities/HtmlEntitiesTool')),
  },
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder',
    short: 'Decode header and claims, check expiry, verify HMAC signatures locally.',
    category: 'encoding',
    keywords: ['jwt', 'token', 'bearer', 'claims', 'jws', 'auth', 'oauth', 'hs256', 'verify'],
    Component: lazy(() => import('./jwt-decoder/JwtDecoderTool')),
  },
  {
    id: 'hash-generator',
    name: 'Hash Generator',
    short: 'MD5, SHA-1, SHA-256/384/512 and CRC32 over text or a dropped file.',
    category: 'encoding',
    keywords: ['hash', 'md5', 'sha', 'sha256', 'sha512', 'checksum', 'crc32', 'digest', 'hmac'],
    Component: lazy(() => import('./hash-generator/HashGeneratorTool')),
  },

  // ---- text ------------------------------------------------------------
  {
    id: 'text-diff',
    name: 'Text Diff',
    short: 'Line-by-line comparison with word-level highlighting inside changes.',
    category: 'text',
    keywords: ['diff', 'compare', 'text', 'changes', 'merge', 'patch', 'difference'],
    Component: lazy(() => import('./text-diff/TextDiffTool')),
  },
  {
    id: 'code-diff',
    name: 'Code Diff',
    short: 'Side-by-side source comparison with unified-patch export.',
    category: 'text',
    keywords: ['diff', 'code', 'side by side', 'patch', 'unified', 'git', 'compare source'],
    Component: lazy(() => import('./code-diff/CodeDiffTool')),
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    short: 'Test patterns against text with live matches, groups, and a timeout guard.',
    category: 'text',
    keywords: ['regex', 'regexp', 'pattern', 'match', 'replace', 'capture', 'groups', 'test'],
    Component: lazy(() => import('./regex-tester/RegexTesterTool')),
  },
  {
    id: 'case-converter',
    name: 'Case Converter',
    short: 'camel, snake, kebab, PascalCase and nine more, converted line by line.',
    category: 'text',
    keywords: ['case', 'camel', 'snake', 'kebab', 'pascal', 'title', 'upper', 'lower', 'slug'],
    Component: lazy(() => import('./case-converter/CaseConverterTool')),
  },
  {
    id: 'text-stats',
    name: 'Text Statistics',
    short: 'Counts, reading time, readability grade, and character frequency.',
    category: 'text',
    keywords: ['text', 'stats', 'count', 'words', 'characters', 'lines', 'readability', 'reading'],
    Component: lazy(() => import('./text-stats/TextStatsTool')),
  },
  {
    id: 'markdown',
    name: 'Markdown Editor',
    short: 'Write with a live sanitised preview, synced scroll, and HTML export.',
    category: 'text',
    keywords: ['markdown', 'md', 'editor', 'preview', 'readme', 'gfm', 'html', 'commonmark'],
    Component: lazy(() => import('./markdown/MarkdownTool')),
  },

  // ---- time ------------------------------------------------------------
  {
    id: 'unix-timestamp',
    name: 'Unix Timestamp',
    short: 'Convert epoch seconds, millis, micros, and nanos in both directions.',
    category: 'time',
    keywords: ['unix', 'timestamp', 'epoch', 'time', 'seconds', 'millis', 'convert', 'date'],
    Component: lazy(() => import('./unix-timestamp/UnixTimestampTool')),
  },
  {
    id: 'datetime-converter',
    name: 'Date/Time Converter',
    short: 'One moment rendered across time zones and every common wire format.',
    category: 'time',
    keywords: ['date', 'time', 'timezone', 'iso8601', 'rfc', 'utc', 'convert', 'offset', 'tz'],
    Component: lazy(() => import('./datetime-converter/DateTimeConverterTool')),
  },
  {
    id: 'cron-helper',
    name: 'Cron Helper',
    short: 'Explain any crontab line in English and preview its next ten runs.',
    category: 'time',
    keywords: ['cron', 'crontab', 'schedule', 'job', 'expression', 'next run', 'quartz'],
    Component: lazy(() => import('./cron-helper/CronHelperTool')),
  },

  // ---- web -------------------------------------------------------------
  {
    id: 'http-client',
    name: 'HTTP Request Builder',
    short: 'Compose a request, send it from your browser, read the full response.',
    category: 'web',
    keywords: ['http', 'request', 'api', 'rest', 'curl', 'fetch', 'headers', 'post', 'client'],
    network: true,
    Component: lazy(() => import('./http-client/HttpClientTool')),
  },
  {
    id: 'url-parser',
    name: 'URL Parser',
    short: 'Break a URL into parts, edit its query, and see the result rebuild.',
    category: 'web',
    keywords: ['url', 'parse', 'query', 'params', 'host', 'path', 'fragment', 'inspect'],
    Component: lazy(() => import('./url-parser/UrlParserTool')),
  },
  {
    id: 'color-converter',
    name: 'Color Converter',
    short: 'HEX, RGB, HSL, OKLCH and CSS names, with WCAG contrast scoring.',
    category: 'web',
    keywords: ['color', 'colour', 'hex', 'rgb', 'hsl', 'oklch', 'contrast', 'wcag', 'palette'],
    Component: lazy(() => import('./color-converter/ColorConverterTool')),
  },

  // ---- generate --------------------------------------------------------
  {
    id: 'uuid-generator',
    name: 'UUID Generator',
    short: 'Bulk v4 and v7 UUIDs, plus NanoIDs, from the platform CSPRNG.',
    category: 'generate',
    keywords: ['uuid', 'guid', 'v4', 'v7', 'nanoid', 'id', 'random', 'identifier', 'ulid'],
    Component: lazy(() => import('./uuid-generator/UuidGeneratorTool')),
  },
  {
    id: 'test-data',
    name: 'Test Data',
    short: 'Lorem ipsum and believable fake records as text, JSON, CSV, or SQL.',
    category: 'generate',
    keywords: [
      'lorem',
      'ipsum',
      'fake',
      'mock',
      'seed',
      'placeholder',
      'test data',
      'faker',
      'csv',
    ],
    Component: lazy(() => import('./test-data/TestDataTool')),
  },
]

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]))

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]))

export function toolsInCategory(id: ToolCategoryId): ToolDefinition[] {
  return TOOLS.filter((t) => t.category === id)
}

export function getTool(id: string | undefined): ToolDefinition | undefined {
  return id ? TOOL_BY_ID.get(id) : undefined
}
