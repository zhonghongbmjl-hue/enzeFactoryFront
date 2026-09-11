import { defineConfig, devices } from '@playwright/test'

const useManagedServers = process.env.GARMENT_E2E_MANAGED_SERVERS !== '0'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'artifacts/real-two-cases-2026-09-11/test-results',
  globalTeardown: useManagedServers ? './e2e/global-teardown.mjs' : undefined,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: 'artifacts/real-two-cases-2026-09-11/html-report', open: 'never' },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: useManagedServers
    ? [
        {
          command:
            'SERVER_PORT=18081 BACKEND_CORS_ALLOWED_ORIGINS=http://127.0.0.1:5174 node e2e/support/e2e-web-server.mjs',
          url: 'http://127.0.0.1:18081/actuator/health/readiness',
          timeout: 180_000,
          reuseExistingServer: false,
        },
        {
          command:
            'corepack pnpm build-only --mode e2e-two-cases && corepack pnpm preview --mode e2e-two-cases --host 127.0.0.1 --port 5174',
          url: 'http://127.0.0.1:5174',
          timeout: 120_000,
          reuseExistingServer: false,
        },
      ]
    : undefined,
  projects: [{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } }],
})
