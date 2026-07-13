import { defineConfig, devices } from '@playwright/test';

const webServer = {
  command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3003',
  env: {
    APP_URL: 'http://127.0.0.1:3003',
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3003',
    WEB_AUTH_ADAPTER: 'development',
  },
  url: 'http://127.0.0.1:3003/vi',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: process.env.E2E_REAL_API
          ? [
              {
                command: 'node ../api/dist/main.js',
                url: 'http://127.0.0.1:4000/api/v1/health/live',
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
              },
              webServer,
            ]
          : webServer,
      }),
});
