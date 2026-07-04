import { expect, type Page } from '@playwright/test';

const PASSWORD = 'test-password-123';

/** Generates a unique email so each test run/user starts with a clean household. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;
}

/**
 * Registers a brand-new user and logs them in. Local Supabase has email
 * confirmations disabled, so the account is usable immediately after
 * registering (see docs/feature-map.md / repo memory notes).
 */
export async function registerAndLogIn(page: Page, email: string): Promise<void> {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Almost done!')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();

  // New users land on the create-household flow.
  await expect(page).toHaveURL(/\/household\/create$/);
}

/** Creates a household and waits for the redirect into the authenticated shell. */
export async function createHousehold(page: Page, name: string): Promise<void> {
  await page.getByLabel('Household name').fill(name);
  await page.getByRole('button', { name: 'Create household' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
}

/** Registers, logs in, and creates a household in one call. */
export async function signUpWithHousehold(
  page: Page,
  options: { emailPrefix: string; householdName: string }
): Promise<void> {
  await registerAndLogIn(page, uniqueEmail(options.emailPrefix));
  await createHousehold(page, options.householdName);
}
