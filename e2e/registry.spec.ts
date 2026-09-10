import { expect, test } from '@playwright/test'
import { TOOL_IDS } from './toolIds'

test('every registered tool loads, names itself, and logs no errors', async ({ page }) => {
  await page.goto('/')

  // Guard against the duplicated slug list in toolIds.ts drifting from the app.
  const rendered = await page
    .locator('a[href^="/t/"]')
    .evaluateAll((links) => [
      ...new Set(links.map((a) => a.getAttribute('href')!.replace('/t/', ''))),
    ])
  expect([...rendered].sort()).toEqual([...TOOL_IDS].sort())
})

for (const toolId of TOOL_IDS) {
  test(`${toolId} mounts without console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto(`/t/${toolId}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')

    // Every tool must offer the shared chrome. Scoped to <main>, because the
    // rail carries a pin button for all 22 tools at once.
    await expect(page.getByRole('main').getByRole('button', { name: /^Pin / })).toBeVisible()
    expect(errors).toEqual([])
  })
}
