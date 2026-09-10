/**
 * The tool slugs, duplicated here on purpose.
 *
 * The e2e suite runs against a built bundle in a separate TypeScript project;
 * importing the registry would pull React and 22 lazy imports into the Node
 * test process. A drift guard in `registry.spec.ts` asserts this list matches
 * what the running app actually renders, so the duplication cannot rot.
 */
export const TOOL_IDS = [
  'json-formatter',
  'json-tree',
  'sql-formatter',
  'base64',
  'url-encoder',
  'html-entities',
  'jwt-decoder',
  'hash-generator',
  'text-diff',
  'code-diff',
  'regex-tester',
  'case-converter',
  'text-stats',
  'markdown',
  'unix-timestamp',
  'datetime-converter',
  'cron-helper',
  'http-client',
  'url-parser',
  'color-converter',
  'uuid-generator',
  'test-data',
] as const
