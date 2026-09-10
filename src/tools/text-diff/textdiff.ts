import type { LineDiffResult } from '@/lib/diff'

/**
 * Percentage of lines that are unchanged, as a stand-in for "how similar are
 * these two texts". Rounded to one decimal place — the tenths digit is
 * legible on a StatGrid readout without implying more precision than a
 * line-level metric actually has.
 */
export function similarityPercent(result: LineDiffResult): number {
  const total = result.added + result.removed + result.unchanged
  if (total === 0) return 100
  return Math.round((result.unchanged / total) * 1000) / 10
}

export const SAMPLE_LEFT = `# Release notes

## v2.3.0
- Add dark mode toggle to settings
- Fix crash when exporting empty projects
- Improve startup time by caching fonts

## v2.2.0
- Add CSV export
- Bump minimum supported Node to 18
`

export const SAMPLE_RIGHT = `# Release notes

## v2.4.0
- Add dark mode toggle to settings
- Add keyboard shortcut for quick export (Cmd+E)
- Fix crash when exporting empty projects
- Improve startup time by caching fonts and lazy-loading icons

## v2.2.0
- Add CSV export
- Bump minimum supported Node to 18
`
