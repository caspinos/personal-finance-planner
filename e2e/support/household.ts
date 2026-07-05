import { expect, type Page } from '@playwright/test';

import { PASSWORD } from './auth';

/** Signs the current user out and waits for the redirect to the login page. */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/**
 * Creates an invite from the household members page (must already be there
 * as the owner) and returns the generated accept link.
 */
export async function inviteMember(
  page: Page,
  options: { email: string; role?: 'Owner' | 'Editor' | 'Viewer' }
): Promise<string> {
  await page.getByLabel('Email').fill(options.email);

  if (options.role) {
    await page.getByRole('combobox', { name: 'Role' }).click();
    await page.getByRole('option', { name: options.role, exact: true }).click();
  }

  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = await page.locator('code').textContent();
  if (!link) {
    throw new Error('Invite link was not rendered after creating the invite.');
  }
  return link;
}

/**
 * Registers a brand-new user by visiting an invite link while signed out.
 * The app redirects to /login (carrying the invite link as returnUrl), so
 * this follows the "Register" link from there and lands back on the invite
 * link, which auto-accepts and redirects into the joined household. The
 * email must match the one the invite was created for.
 */
export async function acceptInviteAsNewUser(
  page: Page,
  options: { link: string; email: string }
): Promise<void> {
  await page.goto(options.link);
  await expect(page).toHaveURL(/\/login\?returnUrl=/);

  await page.getByRole('link', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/register\?returnUrl=/);
  await page.getByLabel('Email').fill(options.email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL('/');
}

/** Locates a member's row on the household members page by their email. */
export function memberRow(page: Page, email: string) {
  return page.locator('li').filter({ hasText: email });
}
