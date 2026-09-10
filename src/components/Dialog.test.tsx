import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Dialog } from './Dialog'

function Harness({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div id="root">
      <button onClick={() => setOpen(true)}>Open</button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false)
          onClose()
        }}
        title="Settings"
      >
        <button>First</button>
        <button>Second</button>
        <button>Third</button>
      </Dialog>
    </div>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('exposes an accessible name from its title', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open'))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('moves focus into the dialog on open', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open'))
    const dialog = await screen.findByRole('dialog')
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
  })

  it('returns focus to the invoking element on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByText('Open')
    await user.click(trigger)
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the backdrop is clicked but not the panel', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await user.click(screen.getByText('Open'))
    const dialog = await screen.findByRole('dialog')

    await user.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    await user.click(dialog.parentElement!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('wraps Tab from the last focusable back to the first', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')

    const close = screen.getByRole('button', { name: 'Close dialog' })
    const third = screen.getByRole('button', { name: 'Third' })

    third.focus()
    await user.tab()
    expect(document.activeElement).toBe(close)
  })

  it('wraps Shift+Tab from the first focusable to the last', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')

    const close = screen.getByRole('button', { name: 'Close dialog' })
    const third = screen.getByRole('button', { name: 'Third' })

    close.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(third)
  })

  it('ignores elements that carry tabindex="-1" when wrapping', async () => {
    // The command palette's option rows are buttons with tabindex="-1": they
    // are activated with the arrow keys, never with Tab. A trap that counted
    // them would compute a "last" element the browser never focuses, and Tab
    // would leave the dialog entirely. This is that regression.
    const user = userEvent.setup()
    function WithRovingItems() {
      const [open, setOpen] = useState(false)
      return (
        <div id="root">
          <button onClick={() => setOpen(true)}>Open</button>
          <button>Outside</button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Palette">
            <input aria-label="Search" />
            <button tabIndex={-1}>Row one</button>
            <button tabIndex={-1}>Row two</button>
          </Dialog>
        </div>
      )
    }

    render(<WithRovingItems />)
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')

    for (let i = 0; i < 6; i++) await user.tab()

    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('marks the app root inert while open so screen readers cannot escape it', async () => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    const root = container.querySelector('#root')!
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')
    expect(root.hasAttribute('inert')).toBe(true)

    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(root.hasAttribute('inert')).toBe(false))
  })

  it('locks background scroll while open and restores it on close', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByText('Open'))
    await screen.findByRole('dialog')
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'))
  })
})
