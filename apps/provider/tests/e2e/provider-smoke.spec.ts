import { expect, test } from '@playwright/test';

test('health endpoint identifies the Provider product', async ({ request }) => {
  const response = await request.get('/api/health/ready');

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: 'ready', product: 'provider' });
});

test('unauthenticated navigation continues through the Provider login', async ({ request }) => {
  const response = await request.get('/', { maxRedirects: 0 });

  expect([302, 303, 307, 308]).toContain(response.status());
  const location = response.headers().location;
  expect(location).toBeTruthy();
  const continuation = new URL(location ?? 'https://invalid.example');
  expect(continuation.pathname).toBe('/vi/auth/login');
  expect(continuation.searchParams.get('product')).toBe('provider');
  expect(['http:', 'https:']).toContain(continuation.protocol);
});

test('command BFF rejects cross-site mutations before authentication', async ({ request }) => {
  const response = await request.post('/api/provider/commands', {
    headers: {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    },
    data: {},
  });

  expect(response.status()).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: 'invalid_origin' });
});

test.describe('authenticated full-stack Provider smoke', () => {
  test.skip(
    !process.env.E2E_PROVIDER_SESSION_TOKEN || !process.env.E2E_PROVIDER_ORGANIZATION_ID,
    'Set E2E_PROVIDER_SESSION_TOKEN and E2E_PROVIDER_ORGANIZATION_ID to exercise the real API.',
  );

  test.beforeEach(async ({ context, baseURL }) => {
    if (!baseURL) throw new Error('A Playwright base URL is required.');
    await context.addCookies([
      {
        name: 'dt_session',
        value: process.env.E2E_PROVIDER_SESSION_TOKEN ?? '',
        url: baseURL,
        sameSite: 'Lax',
      },
      {
        name: 'dt_organization',
        value: process.env.E2E_PROVIDER_ORGANIZATION_ID ?? '',
        url: baseURL,
        sameSite: 'Lax',
      },
    ]);
  });

  for (const route of ['/', '/cases', '/schedule', '/messages', '/clinic']) {
    test(`${route} renders without overflow or browser errors`, async ({ page }) => {
      const browserErrors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));

      const response = await page.goto(route);

      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(browserErrors).toEqual([]);
    });
  }
});
