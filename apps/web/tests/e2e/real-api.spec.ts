import { expect, test } from '@playwright/test';

const realApi = Boolean(process.env.E2E_REAL_API);
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000/api/v1';
const seedPassword = 'DentalTrustDev!2026';

function createValidRegistrationInput() {
  return String.fromCharCode(65) + crypto.randomUUID() + String.fromCharCode(122);
}

test.describe('real API boundary', () => {
  test.skip(!realApi, 'Requires the isolated migrated and seeded E2E database.');

  test('patient login, scoped case creation, and idempotent replay cross the HTTP boundary', async ({
    request,
  }) => {
    const login = await request.post(`${api}/auth/login`, {
      data: { email: 'patient@dentaltrust.local', password: seedPassword },
    });
    expect(login.ok()).toBeTruthy();
    const loginBody = (await login.json()) as { data: { accessToken: string } };
    const authorization = `Bearer ${loginBody.data.accessToken}`;

    const list = await request.get(`${api}/cases?limit=25`, {
      headers: { authorization },
    });
    expect(list.ok()).toBeTruthy();

    const idempotencyKey = crypto.randomUUID();
    const command = {
      title: 'Playwright real API case',
      desiredProcedureCode: 'DENTAL_IMPLANT',
      preferredCurrency: 'USD',
    };
    const first = await request.post(`${api}/cases`, {
      data: command,
      headers: { authorization, 'x-idempotency-key': idempotencyKey },
    });
    const replay = await request.post(`${api}/cases`, {
      data: command,
      headers: { authorization, 'x-idempotency-key': idempotencyKey },
    });
    expect(first.ok()).toBeTruthy();
    expect(replay.ok()).toBeTruthy();
    const firstBody = (await first.json()) as { data: { id: string } };
    const replayBody = (await replay.json()) as { data: { id: string } };
    expect(replayBody.data.id).toBe(firstBody.data.id);
  });

  test('registration rejects a weak password at the shared API contract', async ({ request }) => {
    const response = await request.post(`${api}/auth/register`, {
      data: {
        email: `weak-${Date.now()}@example.com`,
        password: 'a'.repeat(12),
        preferredLocale: 'en-US',
        termsVersion: '2026-07-12',
        privacyVersion: '2026-07-12',
      },
    });

    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR', fieldErrors: { password: expect.any(Array) } },
    });
  });

  test('provider login crosses the BFF and preserves organization selection', async ({ page }) => {
    await page.goto('/en/auth/login?product=provider');
    await page.getByLabel('Email').fill('clinic.admin@saigon-smiles.local');
    await page.getByLabel('Password').fill(seedPassword);
    await page.getByRole('button', { name: 'Sign in securely' }).click();

    await expect(page).toHaveURL(/\/en\/auth\/organization\?product=provider$/u);
    await page.getByRole('button', { name: 'Continue with this organization' }).click();
    await expect(page).toHaveURL('http://localhost:3001/');
    await expect(page.getByRole('heading', { name: 'Trung tâm công việc hôm nay' })).toBeVisible();
  });

  test('registration Save reaches the real API and preserves Care context', async ({ page }) => {
    const credential = createValidRegistrationInput();
    await page.goto(
      '/en/auth/register?product=care&intent=consultation&clinic=minh-an-dental-center',
    );
    await page.getByLabel('Email').fill(`care-save-${Date.now()}@example.com`);
    await page.locator('input[name="password"]').fill(credential);
    await page.getByLabel('Confirm password').fill(credential);
    await page.getByLabel(/I agree to the Terms/u).check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(
      /\/en\/auth\/verify-email\?product=care&intent=consultation&clinic=minh-an-dental-center$/u,
    );
    await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  });

  test('clinic access requires an explicitly selected active organization', async ({ request }) => {
    const login = await request.post(`${api}/auth/login`, {
      data: {
        email: 'clinic.admin@saigon-smiles.local',
        password: seedPassword,
      },
    });
    expect(login.ok()).toBeTruthy();
    const loginBody = (await login.json()) as { data: { accessToken: string } };
    const authorization = `Bearer ${loginBody.data.accessToken}`;
    const identity = await request.get(`${api}/auth/me`, { headers: { authorization } });
    expect(identity.ok()).toBeTruthy();
    const identityBody = (await identity.json()) as {
      data: { availableMemberships: { organizationId: string }[] };
    };
    const organizationId = identityBody.data.availableMemberships[0]?.organizationId;
    expect(organizationId).toBeTruthy();

    expect(
      (await request.get(`${api}/cases?limit=25`, { headers: { authorization } })).status(),
    ).toBe(403);
    expect(
      (
        await request.get(`${api}/cases?limit=25`, {
          headers: { authorization, 'x-organization-id': organizationId ?? '' },
        })
      ).ok(),
    ).toBeTruthy();
  });
});
