import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from './App'
import { PreferencesProvider } from './preferences'
import { ToastProvider } from '@/components/Toast'
import { encodeShareState } from '@/lib/share'

/**
 * Integration coverage for the seams between the shell and a real tool.
 *
 * Each unit is already tested in isolation; what these exercise is the wiring
 * that no unit test can see, a lazy chunk resolving into the shell, the
 * toolbar chrome coming from route context rather than from the tool, share
 * state hydrating from the URL before the tool mounts, and preferences
 * surviving across a navigation.
 */

function renderApp(path: string) {
  return render(
    <div id="root">
      <MemoryRouter initialEntries={[path]}>
        <PreferencesProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </PreferencesProvider>
      </MemoryRouter>
    </div>,
  )
}

describe('app integration', () => {
  it('renders the catalogue at the root', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Twenty-two tools')
  })

  it('loads a lazy tool from a deep link and gives it the shared chrome', async () => {
    renderApp('/t/base64')

    expect(await screen.findByRole('heading', { level: 1, name: 'Base64' })).toBeInTheDocument()
    // The pin and share controls come from the route, not from the tool. Scoped
    // to <main> because the rail carries its own pin button for the same tool.
    const toolbar = within(screen.getByRole('main'))
    expect(toolbar.getByRole('button', { name: 'Pin Base64' })).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: /Share/ })).toBeInTheDocument()
  })

  it('runs a real transformation end to end', async () => {
    const user = userEvent.setup()
    renderApp('/t/base64')

    const input = await screen.findByRole('textbox', { name: 'Text to encode' })
    await user.type(input, 'hi')

    const output = await screen.findByRole('textbox', { name: 'Result' })
    await waitFor(() => expect(output).toHaveValue('aGk='))
  })

  it('sets the document title from the registry', async () => {
    renderApp('/t/hash-generator')
    await screen.findByRole('heading', { level: 1, name: 'Hash Generator' })
    expect(document.title).toBe('Hash Generator · Dev Dock')
  })

  it('suggests near matches for an unknown slug', async () => {
    renderApp('/t/base-64-thing')
    expect(await screen.findByText(/No tool called/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Base64' })).toBeInTheDocument()
  })

  it('pins a tool and shows it in the rail', async () => {
    const user = userEvent.setup()
    renderApp('/t/base64')

    await screen.findByRole('heading', { level: 1, name: 'Base64' })
    const toolbar = within(screen.getByRole('main'))
    await user.click(toolbar.getByRole('button', { name: 'Pin Base64' }))

    const rail = within(screen.getByRole('navigation', { name: 'Tools' }))
    expect(await rail.findByRole('heading', { name: /Pinned/ })).toBeInTheDocument()
    expect(toolbar.getByRole('button', { name: 'Unpin Base64' })).toBeInTheDocument()
  })

  it('records a visit in Recent', async () => {
    renderApp('/t/json-formatter')
    await screen.findByRole('heading', { level: 1, name: 'JSON Formatter' })
    const rail = within(screen.getByRole('navigation', { name: 'Tools' }))
    expect(await rail.findByRole('heading', { name: /Recent/ })).toBeInTheDocument()
  })

  it('hydrates tool state from a share fragment before the tool mounts', async () => {
    const encoded = await encodeShareState({ input: 'aGVsbG8=', direction: 'decode' })
    // MemoryRouter does not touch window.location, which is where the share
    // payload is read from, so it is set directly for this test.
    const original = window.location.hash
    window.location.hash = `#s=${encoded}`

    renderApp('/t/base64')

    const output = await screen.findByRole('textbox', { name: 'Result' })
    await waitFor(() => expect(output).toHaveValue('hello'))

    window.location.hash = original
  })

  it('falls back to an empty tool when the share payload is corrupt', async () => {
    const original = window.location.hash
    window.location.hash = '#s=dNOTVALID!!'

    renderApp('/t/base64')

    const input = await screen.findByRole('textbox', { name: 'Text to encode' })
    expect(input).toHaveValue('')

    window.location.hash = original
  })

  it('opens the command palette with the keyboard from inside a tool', async () => {
    const user = userEvent.setup()
    renderApp('/t/base64')
    await screen.findByRole('heading', { level: 1, name: 'Base64' })

    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('combobox', { name: 'Search tools and actions' })).toBeVisible()
  })

  it('moves focus to <main> and announces the new page on navigation', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await screen.findByRole('heading', { level: 1 })

    const rail = within(screen.getByRole('navigation', { name: 'Tools' }))
    await user.click(rail.getByRole('link', { name: 'Base64' }))

    await screen.findByRole('heading', { level: 1, name: 'Base64' })
    // Nothing else in the app moves focus on a route change, <main> is the
    // one landmark that persists across every tool, so it is what has to
    // pick focus up when the outlet swaps out from under whatever had it.
    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
    expect(screen.getByText('Base64 · Dev Dock')).toBeInTheDocument()
  })

  it('does not steal focus on the very first render', async () => {
    renderApp('/t/base64')
    await screen.findByRole('heading', { level: 1, name: 'Base64' })
    expect(screen.getByRole('main')).not.toHaveFocus()
  })

  it('survives a tool that throws, without taking the shell down', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderApp('/t/base64')
    await screen.findByRole('heading', { level: 1, name: 'Base64' })
    // The rail is rendered by the shell, outside the boundary.
    expect(screen.getByRole('navigation', { name: 'Tools' })).toBeInTheDocument()
    errorSpy.mockRestore()
  })
})
