import { expect, test } from '@playwright/test'

/**
 * The rail is a fixed sidebar on desktop and a drawer below 60rem. That is a
 * different component tree, not a reflow, so it needs its own coverage.
 */

test('the rail is a drawer that opens, navigates, and closes itself', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Show tool list' }).waitFor()

  const rail = page.getByRole('navigation', { name: 'Tools' })
  await expect(rail).toBeHidden()

  const toggle = page.getByRole('button', { name: 'Show tool list' })
  await toggle.click()
  await expect(rail).toBeVisible()

  await rail.getByRole('link', { name: 'Base64' }).click()
  await expect(page).toHaveURL(/\/t\/base64$/)
  // Navigating closes the drawer; leaving it open would cover the tool.
  await expect(rail).toBeHidden()
})

test('the tool toolbar stays usable at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/t/base64')
  await page.getByRole('heading', { level: 1 }).waitFor()

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button', { name: /Pin Base64/ })).toBeVisible()

  // The frame must never scroll sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
