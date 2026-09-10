import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { useDrawerFocus } from './useDrawerFocus'

/** Lets a test decide whether the drawer layout is currently active. */
function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function Harness({ narrow }: { narrow: boolean }) {
  stubMatchMedia(narrow)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLElement | null>(null)
  useDrawerFocus(open, ref, () => setOpen(false))
  return (
    <div>
      <button onClick={() => setOpen(true)}>Open drawer</button>
      <nav ref={ref} aria-label="Tools" hidden={!open}>
        <a href="#one">One</a>
        <a href="#two">Two</a>
      </nav>
      <button>Behind the drawer</button>
    </div>
  )
}

describe('useDrawerFocus', () => {
  it('moves focus into the drawer on open', async () => {
    const user = userEvent.setup()
    render(<Harness narrow />)
    await user.click(screen.getByText('Open drawer'))
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'One' }))
  })

  it('wraps Tab at the end of the drawer instead of leaking into the page', async () => {
    const user = userEvent.setup()
    render(<Harness narrow />)
    await user.click(screen.getByText('Open drawer'))

    screen.getByRole('link', { name: 'Two' }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'One' }))
  })

  it('wraps Shift+Tab at the start', async () => {
    const user = userEvent.setup()
    render(<Harness narrow />)
    await user.click(screen.getByText('Open drawer'))

    screen.getByRole('link', { name: 'One' }).focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Two' }))
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness narrow />)
    const trigger = screen.getByText('Open drawer')
    await user.click(trigger)
    await user.keyboard('{Escape}')
    // `hidden` removes the drawer from the accessibility tree entirely, which
    // is the point: closed means gone, not merely off-screen.
    expect(screen.queryByRole('navigation', { name: 'Tools' })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('does nothing at desktop width, where the rail is a permanent sidebar', async () => {
    const user = userEvent.setup()
    render(<Harness narrow={false} />)
    const trigger = screen.getByText('Open drawer')
    await user.click(trigger)
    // Focus stays on the trigger; nothing is trapped.
    expect(document.activeElement).toBe(trigger)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'One' }))
  })
})
