import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { TOOL_IDS } from './toolIds'

/**
 * Automated accessibility checks.
 *
 * Axe catches perhaps a third of real accessibility problems, the mechanical
 * third: missing names, bad contrast, invalid ARIA, orphaned form controls. It
 * cannot tell you whether a keyboard user can actually complete a task, which
 * is why `shell.spec.ts` tests focus order, the focus trap, and the palette's
 * combobox semantics by hand. Both layers are necessary; neither is sufficient.
 *
 * Every tool is scanned in both themes, because a contrast failure that only
 * exists in dark mode is exactly the kind that ships.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const THEMES = ['light', 'dark'] as const

async function scan(page: Page) {
  return (
    new AxeBuilder({ page })
      .withTags(TAGS)
      // `[data-color-demo]` marks the Color Converter's preview swatches. Their
      // colours are chosen by the user and the point of the demo is to show a
      // pairing pass *or fail*, so a contrast rule fires on them by design.
      // They are already `aria-hidden`; axe evaluates contrast visually, so it
      // needs telling separately. This is the only exclusion in the suite, and
      // it is deliberately expressed as a marked element rather than a rule
      // switched off across the app.
      .exclude('[data-color-demo]')
      .analyze()
  )
}

/**
 * Axe returns the full DOM node for every violation, which turns a one-line
 * failure into hundreds of lines of serialised HTML. Summarising first means
 * the failure message names the rule and where it fired, which is the part
 * anyone actually reads.
 */
/**
 * Sets the theme the way a user would, through the stored preference, before
 * anything renders.
 *
 * Writing `data-theme` with `page.evaluate` after load looks equivalent and is
 * racy: the app's own effect writes the same attribute on mount, so a scan that
 * starts between the two reads whichever won. Seeding storage and reloading
 * makes the pre-paint script and React agree from the first frame.
 */
async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('devdock:theme', JSON.stringify(t)), theme)
  await page.reload()
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme)
}

function summarise(results: Awaited<ReturnType<typeof scan>>) {
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    where: violation.nodes.slice(0, 4).map((node) => node.target.join(' ')),
    count: violation.nodes.length,
  }))
}

test.describe('accessibility', () => {
  for (const theme of THEMES) {
    test(`home page has no violations in ${theme} mode`, async ({ page }) => {
      await page.goto('/')
      await page.getByRole('heading', { level: 1 }).waitFor()
      await useTheme(page, theme)
      expect(summarise(await scan(page))).toEqual([])
    })
  }

  for (const toolId of TOOL_IDS) {
    for (const theme of THEMES) {
      test(`${toolId} has no violations in ${theme} mode`, async ({ page }) => {
        await page.goto(`/t/${toolId}`)
        await page.getByRole('heading', { level: 1 }).waitFor()
        await useTheme(page, theme)
        await page.getByRole('heading', { level: 1 }).waitFor()
        expect(summarise(await scan(page))).toEqual([])
      })
    }
  }

  test('the command palette has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Search 22 tools/ }).waitFor()
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('dialog').waitFor()
    expect(summarise(await scan(page))).toEqual([])
  })

  test('the shortcut dialog has no violations while open', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /Search 22 tools/ }).waitFor()
    await page.keyboard.press('Shift+/')
    await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).waitFor()
    expect(summarise(await scan(page))).toEqual([])
  })
})
