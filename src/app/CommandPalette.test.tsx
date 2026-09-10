import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'
import type { Command } from './commands'

const makeCommands = (run = vi.fn()): Command[] => [
  {
    id: 'tool:json-formatter',
    name: 'JSON Formatter',
    description: 'Pretty-print and validate JSON.',
    tag: 'Data',
    section: 'Tools',
    keywords: 'json beautify minify',
    run,
  },
  {
    id: 'tool:base64',
    name: 'Base64',
    description: 'Encode and decode Base64.',
    tag: 'Encoding',
    section: 'Tools',
    keywords: 'b64 atob btoa',
    run,
  },
  {
    id: 'action:theme',
    name: 'Cycle theme',
    description: 'Light, dark, or system.',
    tag: 'View',
    section: 'Actions',
    keywords: 'dark light appearance',
    run,
  },
]

function setup(run = vi.fn()) {
  const onClose = vi.fn()
  render(
    <div id="root">
      <CommandPalette open onClose={onClose} commands={makeCommands(run)} />
    </div>,
  )
  return { onClose, run }
}

describe('CommandPalette', () => {
  it('lists every command when the query is empty', () => {
    setup()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('declares combobox semantics against the results listbox', () => {
    setup()
    const input = screen.getByRole('combobox', { name: 'Search tools and actions' })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const listId = input.getAttribute('aria-controls')!
    expect(document.getElementById(listId)).toHaveAttribute('role', 'listbox')
  })

  it('points aria-activedescendant at the highlighted option', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByRole('combobox', { name: 'Search tools and actions' })
    const options = screen.getAllByRole('option')

    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id)
  })

  it('filters as you type and ranks the best match first', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'base')
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Base64')
  })

  it('matches on hidden keywords as well as names', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'btoa')
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Base64')
  })

  it('highlights the matched characters in the name', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'json')
    const option = screen.getAllByRole('option')[0]!
    expect(within(option).getByText('JSON')).toBeInTheDocument()
  })

  it('wraps the selection at both ends of the list', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByRole('combobox')
    const options = screen.getAllByRole('option')

    await user.keyboard('{ArrowUp}')
    expect(input).toHaveAttribute('aria-activedescendant', options[2]!.id)
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id)
  })

  it('runs the highlighted command on Enter and closes', async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    const { onClose } = setup(run)
    await user.type(screen.getByRole('combobox'), 'theme')
    await user.keyboard('{Enter}')
    expect(run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('runs a command on click', async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    setup(run)
    await user.click(screen.getAllByRole('option')[1]!)
    expect(run).toHaveBeenCalledOnce()
  })

  it('does nothing on Enter when nothing matches', async () => {
    const user = userEvent.setup()
    const run = vi.fn()
    setup(run)
    await user.type(screen.getByRole('combobox'), 'zzzzz')
    await user.keyboard('{Enter}')
    expect(run).not.toHaveBeenCalled()
  })

  it('explains an empty result rather than showing a blank list', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'zzzzz')
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('announces the result count to assistive technology', async () => {
    const user = userEvent.setup()
    setup()
    await user.type(screen.getByRole('combobox'), 'base')
    expect(screen.getByRole('status')).toHaveTextContent('1 result')
  })

  it('keeps focus in the search field while arrowing', async () => {
    const user = userEvent.setup()
    setup()
    const input = screen.getByRole('combobox')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(input)
  })
})
