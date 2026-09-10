import { describe, expect, it } from 'vitest'
import { formatRelative } from './relative'

describe('formatRelative', () => {
  const now = new Date(2026, 0, 10, 12, 0, 0)

  it('says "now" for anything under a second', () => {
    expect(formatRelative(now, now)).toBe('now')
  })

  it('describes a future run', () => {
    expect(formatRelative(new Date(now.getTime() + 3_600_000), now)).toBe('in 1 hour')
  })

  it('describes a past instant', () => {
    expect(formatRelative(new Date(now.getTime() - 2 * 86_400_000), now)).toBe('2 days ago')
  })

  it('picks the largest unit that still applies', () => {
    expect(formatRelative(new Date(now.getTime() + 90_000), now)).toBe('in 2 minutes')
  })

  it('pluralises singular counts correctly', () => {
    expect(formatRelative(new Date(now.getTime() + 60_000), now)).toBe('in 1 minute')
  })
})
