import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CodeDiffTool from './CodeDiffTool'

// `goToChange` scrolls the newly-current change into view. `base.css` forces
// CSS `scroll-behavior` back to `auto` under prefers-reduced-motion, but that
// cannot reach a `behavior` passed straight to `scrollIntoView`, so the
// component has to check `matchMedia` itself before asking for a smooth
// scroll, this locks that check in.
describe('CodeDiffTool change navigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockReducedMotion(matches: boolean) {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion') ? matches : false,
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as MediaQueryList,
    )
  }

  async function loadSampleWithChanges() {
    const user = userEvent.setup()
    render(<CodeDiffTool />)
    await user.click(screen.getByRole('button', { name: 'Sample' }))
    await user.click(await screen.findByRole('button', { name: /Next/ }))
  }

  it('scrolls instantly when the user prefers reduced motion', async () => {
    mockReducedMotion(true)
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    await loadSampleWithChanges()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }))
  })

  it('scrolls smoothly otherwise', async () => {
    mockReducedMotion(false)
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    await loadSampleWithChanges()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
  })
})
