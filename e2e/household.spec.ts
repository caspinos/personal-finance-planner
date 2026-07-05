import { expect, test } from '@playwright/test';

import { logIn, signUpWithHousehold, uniqueEmail } from './support/auth';
import { acceptInviteAsNewUser, inviteMember, memberRow, signOut } from './support/household';

test.describe('Household members', () => {
  test('invites a new member, who joins with the assigned role', async ({ page }) => {
    const householdName = `Household ${Date.now()}`;
    await signUpWithHousehold(page, { emailPrefix: 'owner', householdName });

    await page.goto('/household/members');
    await expect(page.getByRole('heading', { name: 'Household members' })).toBeVisible();

    const invitee = uniqueEmail('invitee');
    const link = await inviteMember(page, { email: invitee, role: 'Editor' });
    await expect(page.getByText(invitee, { exact: true })).toBeVisible();

    await signOut(page);
    await acceptInviteAsNewUser(page, { link, email: invitee });
    await expect(page.getByRole('heading', { name: `Welcome, ${householdName}` })).toBeVisible();

    await page.goto('/household/members');
    await expect(memberRow(page, invitee).getByText('Editor')).toBeVisible();
    // Non-owners don't get the invite/role-management controls.
    await expect(page.getByRole('heading', { name: 'Invite someone' })).not.toBeVisible();
  });

  test('owner changes a member role and removes them', async ({ page }) => {
    const householdName = `Household ${Date.now()}`;
    await signUpWithHousehold(page, { emailPrefix: 'owner', householdName });
    const ownerEmail = (await page.locator('header').getByText('@example.com').textContent())!;

    await page.goto('/household/members');
    const colleague = uniqueEmail('colleague');
    const link = await inviteMember(page, { email: colleague });

    await signOut(page);
    await acceptInviteAsNewUser(page, { link, email: colleague });

    await signOut(page);
    await logIn(page, ownerEmail);
    await page.goto('/household/members');

    const row = memberRow(page, colleague);
    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Editor', exact: true }).click();
    await expect(row.getByText('Editor')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(memberRow(page, colleague)).toHaveCount(0);
  });

  test('revokes a pending invite so it can no longer be accepted', async ({ page }) => {
    await signUpWithHousehold(page, {
      emailPrefix: 'owner',
      householdName: `Household ${Date.now()}`,
    });

    await page.goto('/household/members');
    const revoked = uniqueEmail('revoked');
    const link = await inviteMember(page, { email: revoked });
    await expect(page.getByText(revoked, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText('No pending invites.')).toBeVisible();

    await signOut(page);
    await page.goto(link);
    await expect(page).toHaveURL(/\/login\?returnUrl=/);
    await page.getByRole('link', { name: 'Register' }).click();
    // The register route is lazy-loaded; wait for the navigation to land
    // before interacting, otherwise the email fill can race the route swap
    // and land in the login page's email field instead.
    await expect(page).toHaveURL(/\/register\?returnUrl=/);
    await page.getByLabel('Email').fill(revoked);
    await page.getByLabel('Password').fill('test-password-123');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText("Couldn't accept this invite")).toBeVisible();
    await expect(page.getByText(/invalid, already used, or has expired/)).toBeVisible();
  });
});
