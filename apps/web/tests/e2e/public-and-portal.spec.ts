import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publicPaths } from '../../lib/routing';

async function expectWcagAA(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations,
    results.violations.map((violation) => `${violation.id}: ${violation.help}`).join('\n'),
  ).toEqual([]);
}

test('visitor can switch language and inspect a clinic', async ({ page, isMobile }) => {
  await page.goto('/vi');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Làm răng tại Việt Nam');
  await expectWcagAA(page);
  if (isMobile) await page.getByRole('button', { name: 'Mở trình đơn' }).click();
  await page.getByRole('link', { name: /Ngôn ngữ/i }).click();
  await expect(page).toHaveURL(/\/en$/);
  await page.getByRole('link', { name: 'Find clinics' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Find a clinic');
  await expectWcagAA(page);
  await page.getByRole('link', { name: 'View details' }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Minh An Dental Center');
  await expectWcagAA(page);
});

test('development patient sign-in reaches the protected dashboard', async ({ page, isMobile }) => {
  await page.goto('/en/auth/login');
  await expectWcagAA(page);
  await page.getByRole('button', { name: 'Patient' }).click();
  await expect(page).toHaveURL(/\/en\/app$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
  await expect(page.getByText('Next action').first()).toBeVisible();
  if (isMobile) {
    await expect(page.locator('.portal-mobile-nav')).toBeVisible();
    await page.getByRole('button', { name: 'More' }).click();
    const mobileMenu = page.getByRole('dialog', { name: 'Mobile navigation' });
    await expect(mobileMenu.getByRole('link', { name: 'Data & privacy' })).toBeVisible();
    await expectWcagAA(page);
    await mobileMenu.getByRole('button', { name: 'Close' }).click();
  } else await expect(page.getByText('Secure session').first()).toBeVisible();
  await expectWcagAA(page);
});

test('contact request is acknowledged only after the local adapter accepts it', async ({
  page,
}) => {
  await page.goto('/en/contact');
  await page.getByLabel('Full name').fill('Alex Nguyen');
  await page.getByLabel('Email').fill('alex@example.com');
  await page.getByLabel('Topic').selectOption({ index: 1 });
  await page
    .getByLabel('Message')
    .fill('I need help preparing records for an implant consultation.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('heading', { name: 'We received your request' })).toBeVisible();
});

test('patient registration, email verification, and profile entry are connected', async ({
  page,
}) => {
  const credential = String.fromCharCode(65) + crypto.randomUUID() + String.fromCharCode(122);

  await page.goto('/en/auth/register');
  await page.getByLabel('Email').fill(`patient-${Date.now()}@example.com`);
  await page.locator('input[name="password"]').fill(credential);
  await page.getByLabel('Confirm password').fill(credential);
  await page.getByLabel(/I agree to the Terms/).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/en\/auth\/verify-email/);
  await page.getByLabel('6-digit code').fill('246810');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/en\/app$/);
});

test('registration blocks a weak password before Save reaches the API', async ({ page }) => {
  const weakCredential = 'a'.repeat(12);

  await page.goto('/en/auth/register?product=care');
  await expect(page.getByText(/upper-case, lower-case, and a number/u)).toBeVisible();
  await page.getByLabel('Email').fill(`weak-${Date.now()}@example.com`);
  await page.locator('input[name="password"]').fill(weakCredential);
  await page.getByLabel('Confirm password').fill(weakCredential);
  await page.getByLabel(/I agree to the Terms/).check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/en\/auth\/register\?product=care$/);
  expect(
    await page
      .locator('input[name="password"]')
      .evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(false);
});

test('privacy mutation receives adapter acknowledgement and updates the workspace', async ({
  page,
}) => {
  await page.goto('/en/auth/login');
  await page.getByRole('button', { name: 'Patient' }).click();
  await expect(page).toHaveURL(/\/en\/app$/);
  await page.goto('/en/app/privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Data & privacy' })).toBeVisible();
  await page
    .getByLabel('Why you are making this request')
    .fill('I want a portable copy of my dental records.');
  await page.getByRole('button', { name: 'Submit privacy request' }).click();
  await expect(page.getByText('Your privacy request was submitted securely.')).toBeVisible();
});

test('patient is denied an administrative route', async ({ page }) => {
  await page.goto('/en/auth/login');
  await page.getByRole('button', { name: 'Patient' }).click();
  await expect(page).toHaveURL(/\/en\/app$/);
  await page.goto('/en/admin/users');
  await expect(page).toHaveURL(/\/en\/auth\/login\?error=permission/);
  await expect(page.getByText('You do not have permission to view this workspace.')).toBeVisible();
});

test('every sitemap public route and required public profile resolves', async ({ page }) => {
  for (const locale of ['vi', 'en'] as const) {
    for (const path of publicPaths) {
      const response = await page.goto(`/${locale}${path ? `/${path}` : ''}`);
      expect(response?.status(), `${locale}/${path}`).toBeLessThan(400);
    }
    for (const profile of ['clinics/minh-an-dental-center', 'dentists/nguyen-minh-tam']) {
      const response = await page.goto(`/${locale}/${profile}`);
      expect(response?.status(), `${locale}/${profile}`).toBeLessThan(400);
    }
  }
});

for (const access of [
  { label: 'Patient', area: 'app' },
  { label: 'Clinic', area: 'clinic' },
  { label: 'Concierge', area: 'concierge' },
  { label: 'Verification', area: 'verification-admin' },
  { label: 'Administrator', area: 'admin' },
] as const) {
  test(`${access.label} navigation has no broken protected route`, async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/en/auth/login');
    await page.getByRole('button', { name: access.label }).click();
    await expect(page).toHaveURL(new RegExp(`/en/${access.area}$`));
    await expect(page.locator('main#main-content:not([aria-busy])')).toBeVisible();
    const navigationLinks = page.locator('.portal-nav a');
    const hrefs = await navigationLinks.evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href')).filter(Boolean),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const response = await page.goto(href as string);
      expect(response?.status(), href as string).toBeLessThan(400);
      await expect(page.locator('main#main-content:not([aria-busy])')).toBeVisible();
    }
  });
}

test('public clinic search works at a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/clinics');
  await page.getByRole('button', { name: 'Filters' }).click();
  const filters = page.getByRole('dialog', { name: 'Filters' });
  await expect(filters).toBeVisible();
  await expectWcagAA(page);
  await filters.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Search' })).toBeEnabled();
  await page.getByRole('searchbox').fill('Lotus');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByRole('heading', { name: 'Lotus Oral Care' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Minh An Dental Center' })).toHaveCount(0);
});
