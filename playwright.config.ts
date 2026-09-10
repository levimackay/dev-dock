import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the *production build*, not the dev server.
 *
 * That is deliberate: the things most likely to break between dev and prod —
 * lazy chunk loading, the manual chunk split, minification of a hand-written
 * worker, base-path handling — are invisible if the suite only ever exercises
 * Vite's dev middleware.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The mobile specs assert on the drawer layout, which only exists below
      // 60rem. Without this they also run at desktop width, where the rail is a
      // permanent sidebar, and fail for the right reason at the wrong size.
      testIgnore: /.*\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'pnpm run build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
