import { defineConfig, devices } from '@playwright/test';

const localPort = process.env.PLAYWRIGHT_PORT ?? '3101';
const localBaseUrl = `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? localBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile-390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
    {
      name: 'tablet-1024',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 900 } },
    },
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: `pnpm exec next dev --hostname 127.0.0.1 --port ${localPort}`,
          env: {
            NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api/v1',
            PUBLIC_APP_URL: process.env.PUBLIC_APP_URL ?? 'http://127.0.0.1:3003',
          },
          url: `${localBaseUrl}/api/health/ready`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
