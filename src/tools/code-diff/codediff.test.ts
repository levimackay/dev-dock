import { describe, expect, it } from 'vitest'
import { preprocessForDiff, sanitizeFileLabel } from './codediff'

describe('preprocessForDiff', () => {
  it('is a no-op with both options off', () => {
    const text = 'a  \n\nb\n'
    expect(
      preprocessForDiff(text, { ignoreTrailingWhitespace: false, ignoreBlankLines: false }),
    ).toBe(text)
  })

  it('strips only trailing whitespace, keeping leading indentation', () => {
    const text = '  a  \n\tb\t\n'
    expect(
      preprocessForDiff(text, { ignoreTrailingWhitespace: true, ignoreBlankLines: false }),
    ).toBe('  a\n\tb\n')
  })

  it('removes blank and whitespace-only lines', () => {
    const text = 'a\n\n  \nb\n'
    expect(
      preprocessForDiff(text, { ignoreTrailingWhitespace: false, ignoreBlankLines: true }),
    ).toBe('a\nb')
  })

  it('applies both options together', () => {
    const text = 'a  \n   \nb\n'
    expect(
      preprocessForDiff(text, { ignoreTrailingWhitespace: true, ignoreBlankLines: true }),
    ).toBe('a\nb')
  })

  it('handles empty input', () => {
    expect(preprocessForDiff('', { ignoreTrailingWhitespace: true, ignoreBlankLines: true })).toBe(
      '',
    )
  })
})

describe('sanitizeFileLabel', () => {
  it('keeps a normal filename as-is', () => {
    expect(sanitizeFileLabel('main.ts', 'a')).toBe('main.ts')
  })

  it('falls back on empty input', () => {
    expect(sanitizeFileLabel('', 'a')).toBe('a')
  })

  it('falls back on whitespace-only input', () => {
    expect(sanitizeFileLabel('   ', 'a')).toBe('a')
  })

  it('collapses internal whitespace', () => {
    expect(sanitizeFileLabel('my   file.ts', 'a')).toBe('my file.ts')
  })
})
