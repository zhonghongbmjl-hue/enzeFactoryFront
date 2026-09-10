import { defineConfig, devices } from '@playwright/test'

const externalBaseUrl =
  process.env.GARMENT_E2E_EXTERNAL_BASE_URL ?? process.env.GARMENT_E2E_UI_BASE_URL

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/support/**/*.test.mjs'],
  globalTeardown: externalBaseUrl ? undefined : './e2e/global-teardown.mjs',
  fullyParallel: true,
  retries: 1,
  reporter: 'html',
  use: { baseURL: externalBaseUrl ?? 'http://localhost:5173', trace: 'on-first-retry' },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: 'node e2e/support/e2e-web-server.mjs',
          url: 'http://127.0.0.1:18080/actuator/health/readiness',
          timeout: 180_000,
          reuseExistingServer: false,
        },
        {
          command:
            'corepack pnpm build-only --mode e2e && corepack pnpm preview --mode e2e --host 127.0.0.1 --port 5173',
          url: 'http://127.0.0.1:5173',
          timeout: 120_000,
          reuseExistingServer: !process.env.CI,
        },
      ],
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'narrow-chromium', use: { ...devices['Pixel 7'] } },
  ],
})
