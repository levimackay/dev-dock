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

/**
 * Axe returns the full DOM node for every violation, which turns a one-line
 * failure into hundreds of lines of serialised HTML. Summarising first means
 * the failure message names the rule and where it fired, which is the part
 * anyone actually reads.
 */
function summarise(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    where: violation.nodes.slice(0, 4).map((node) => node.target.join(' ')),
    count: violation.nodes.length,
  }))
}

test.describe('accessibility', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`home page has no violations in ${theme} mode`, async ({ page }) => {
      await page.goto('/')
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
      expect(summarise(await scan(page))).toEqual([])
    })
  }

  for (const toolId of TOOL_IDS) {
    test(`${toolId} has no violations`, async ({ page }) => {
      await page.goto(`/t/${toolId}`)
      await page.getByRole('heading', { level: 1 }).waitFor()
      expect(summarise(await scan(page))).toEqual([])
    })
  }

  test('the command palette has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('dialog').waitFor()
    expect(summarise(await scan(page))).toEqual([])
  })

  test('the shortcut dialog has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('Shift+/')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    expect(summarise(await scan(page))).toEqual([])
  })
})
