import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { diffLines } from '@/lib/diff'
import { DiffView } from './DiffView'

describe('DiffView', () => {
  it('marks added/removed rows in side-by-side mode with a non-colour symbol, not tint alone', () => {
    const result = diffLines('one\ntwo\nthree', 'one\ntwo\nfour')
    const { container } = render(<DiffView result={result} mode="side-by-side" />)

    // "three" was removed, "four" was added. Each changed side must carry a
    // "+"/"-" text marker (mirroring unified mode's marker column) so the
    // distinction is not carried by background tint alone (WCAG 1.4.1).
    const removedSide = [...container.querySelectorAll('[class*="sideRemoved"]')].find((el) =>
      el.textContent?.includes('three'),
    )
    const addedSide = [...container.querySelectorAll('[class*="sideAdded"]')].find((el) =>
      el.textContent?.includes('four'),
    )
    expect(removedSide?.querySelector('[class*="sideMarker"]')?.textContent).toBe('-')
    expect(addedSide?.querySelector('[class*="sideMarker"]')?.textContent).toBe('+')
  })

  it('gives unchanged rows a blank marker rather than omitting the column', () => {
    const result = diffLines('one\ntwo', 'one\ntwo')
    const { container } = render(<DiffView result={result} mode="side-by-side" />)
    const markers = container.querySelectorAll('[class*="sideMarker"]')
    expect(markers.length).toBeGreaterThan(0)
    markers.forEach((m) => expect(m.textContent).toBe(' '))
  })
})
