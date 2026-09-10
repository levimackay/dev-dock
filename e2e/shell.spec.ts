import { expect, test, type Page } from '@playwright/test'

/**
 * Shell-level end-to-end coverage: the parts of the app every tool depends on.
 *
 * These run against the production build (see playwright.config.ts), so they
 * also serve as a smoke test that code splitting, the service-free routing
 * fallback, and the pre-paint theme script all survive minification.
 */

/**
 * The app is a client-rendered SPA behind a lazy entry chunk, so `page.goto`
 * resolving on `load` does not mean React has mounted. Every test that presses
 * a key or asserts on app markup waits for a control the shell renders first;
 * without it the suite is a coin toss on a cold cache.
 */
async function openApp(page: Page, path = '/') {
  await page.goto(path)
  await page.getByRole('button', { name: /Search 22 tools/ }).waitFor()
}

test.describe('home page', () => {
  test('lists every tool grouped by category', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Twenty-two tools')

    // Scoped to <main>: the rail carries its own category headings.
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 2 })).toHaveCount(6)
    expect(await main.locator('a[href^="/t/"]').count()).toBeGreaterThanOrEqual(22)
  })

  test('states the privacy claim and its one exception', async ({ page }) => {
    await openApp(page)
    await expect(page.getByText('Nothing leaves the tab')).toBeVisible()
    await expect(page.getByText('One labelled exception')).toBeVisible()
  })
})

test.describe('command palette', () => {
  test('opens with the keyboard, filters, and navigates', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('ControlOrMeta+k')

    const search = page.getByRole('combobox', { name: 'Search tools and actions' })
    await expect(search).toBeFocused()

    await search.fill('base64')
    const options = page.getByRole('option')
    await expect(options.first()).toContainText('Base64')

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/t\/base64$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Base64')
  })

  test('arrow keys move the selection without moving focus', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('ControlOrMeta+k')
    const search = page.getByRole('combobox', { name: 'Search tools and actions' })

    const firstId = await search.getAttribute('aria-activedescendant')
    await page.keyboard.press('ArrowDown')
    const secondId = await search.getAttribute('aria-activedescendant')

    expect(secondId).not.toBe(firstId)
    await expect(search).toBeFocused()
  })

  test('explains an empty result instead of showing a blank list', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox', { name: 'Search tools and actions' }).fill('zzzzqqqq')
    await expect(page.getByText(/Nothing matches/)).toBeVisible()
  })

  test('Escape closes it and returns focus to the trigger', async ({ page }) => {
    await openApp(page)
    const trigger = page.getByRole('button', { name: /Search 22 tools/ })
    await trigger.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('traps focus while open', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('ControlOrMeta+k')
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
    const inDialog = await page.evaluate(
      () => document.activeElement?.closest('[role="dialog"]') !== null,
    )
    expect(inDialog).toBe(true)
  })
})

test.describe('theme', () => {
  test('cycles and survives a reload', async ({ page }) => {
    await openApp(page)
    const toggle = page.getByRole('button', { name: /^Theme:/ })

    await toggle.click()
    const chosen = await page.evaluate(() => document.documentElement.dataset.theme)

    await page.reload()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(chosen)
  })

  test('the pre-paint script applies the stored theme before React runs', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => localStorage.setItem('devdock:theme', '"dark"'))
    await page.reload()
    // Read the attribute at the earliest opportunity; if the inline script were
    // missing this would briefly be undefined and the page would flash light.
    const theme = await page.evaluate(() => document.documentElement.dataset.theme)
    expect(theme).toBe('dark')
  })
})

test.describe('pins and recents', () => {
  test('pinning a tool adds it to the rail and persists', async ({ page }) => {
    await openApp(page, '/t/uuid-generator')
    const toolbar = page.getByRole('main')
    await toolbar.getByRole('button', { name: 'Pin UUID Generator' }).click()

    const rail = page.getByRole('navigation', { name: 'Tools' })
    await expect(rail.getByRole('heading', { name: /Pinned/ })).toBeVisible()

    await page.reload()
    await expect(rail.getByRole('heading', { name: /Pinned/ })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Unpin UUID Generator' })).toBeVisible()
  })

  test('visiting a tool adds it to Recent', async ({ page }) => {
    await openApp(page, '/t/base64')
    await openApp(page, '/t/url-parser')
    const rail = page.getByRole('navigation', { name: 'Tools' })
    await expect(rail.getByRole('heading', { name: /Recent/ })).toBeVisible()
  })
})

test.describe('routing', () => {
  test('a deep link loads the tool directly', async ({ page }) => {
    await openApp(page, '/t/hash-generator')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hash Generator')
  })

  test('an unknown tool suggests close matches instead of dead-ending', async ({ page }) => {
    await openApp(page, '/t/json-formater')
    await expect(page.getByText(/No tool called/)).toBeVisible()
    // Scoped: the rail links to every tool by name as well.
    await expect(page.getByRole('main').getByRole('link', { name: 'JSON Formatter' })).toBeVisible()
  })

  test('the skip link reaches the tool region', async ({ page }) => {
    await openApp(page, '/t/base64')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to tool' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main$/)
  })
})

test.describe('keyboard shortcuts', () => {
  test('? opens the shortcut reference', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('Shift+/')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  })

  test('the shortcut list is rendered for this platform', async ({ page }) => {
    await openApp(page)
    await page.keyboard.press('Shift+/')
    const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
    await expect(dialog.getByText('Open the command palette')).toBeVisible()
  })
})

test('no console errors on the home page or a tool', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await page.goto('/t/json-formatter')
  await page.waitForLoadState('networkidle')

  expect(errors).toEqual([])
})
