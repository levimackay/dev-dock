import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { TOOL_IDS } from './toolIds'

/**
 * Automated accessibility checks.
 *
 * Axe catches perhaps a third of real accessibility problems — the mechanical
 * third: missing names, bad contrast, invalid ARIA, orphaned form controls. It
 * cannot tell you whether a keyboard user can actually complete a task, which
 * is why `shell.spec.ts` tests focus order, the focus trap, and the palette's
 * combobox semantics by hand. Both layers are necessary; neither is sufficient.
 *
 * Every tool is scanned in both themes, because a contrast failure that only
 * exists in dark mode is exactly the kind that ships.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(TAGS).analyze()
}

test.describe('accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`home page has no violations in ${theme} mode`, async ({ page }) => {
      await page.goto('/')
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      const results = await scan(page)
      expect(results.violations).toEqual([])
    })
  }

  for (const toolId of TOOL_IDS) {
    test(`${toolId} has no violations`, async ({ page }) => {
      await page.goto(`/t/${toolId}`)
      await page.getByRole('heading', { level: 1 }).waitFor()
      const results = await scan(page)
      expect(results.violations).toEqual([])
    })
  }

  test('the command palette has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('dialog').waitFor()
    const results = await scan(page)
    expect(results.violations).toEqual([])
  })

  test('the shortcut dialog has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Shift+/')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    const results = await scan(page)
    expect(results.violations).toEqual([])
  })
})
