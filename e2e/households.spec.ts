import { expect, test } from '@playwright/test';

import { createHousehold, registerAndLogIn, signUpWithHousehold, uniqueEmail } from './support/auth';
import { createEnvelope, selectComboboxOption } from './support/budget';
import { signOut } from './support/household';

test.describe('Multiple households', () => {
  test('creates a second household, switches back, and keeps their data apart', async ({
    page,
  }) => {
    const suffix = Date.now();
    const first = `Alpha ${suffix}`;
    const second = `Beta ${suffix}`;

    await signUpWithHousehold(page, { emailPrefix: 'multi', householdName: first });

    // One household needs no switcher — the header just names it.
    await expect(page.locator('header').getByText(first)).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Household' })).toHaveCount(0);

    // Give the first household a piece of data the second must not show.
    await page.goto('/budget');
    await createEnvelope(page, 'Groceries');

    await page.getByRole('link', { name: 'New household' }).click();
    await expect(page).toHaveURL('/household/create');
    await expect(page.getByRole('heading', { name: 'Create another household' })).toBeVisible();
    // The page lists what already exists, so a duplicate is visible up front.
    await expect(page.getByText(first)).toBeVisible();
    await createHousehold(page, second);

    // The switcher shows up once there is something to switch between.
    await expect(page.getByRole('combobox', { name: 'Household' })).toHaveText(second);

    // The new household starts empty — this is the bug the switcher exists for.
    await page.goto('/budget');
    await expect(page.getByRole('heading', { name: 'Groceries' })).toHaveCount(0);

    await selectComboboxOption(page, 'Household', first);
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: `Welcome, ${first}` })).toBeVisible();

    // Switching must drop the other household's cached budget data, not merge it.
    await page.goto('/budget');
    await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
  });

  test('signing out drops the previous account household state', async ({ page }) => {
    const suffix = Date.now();

    await registerAndLogIn(page, uniqueEmail('alpha'));
    await createHousehold(page, `Alpha ${suffix}`);
    await signOut(page);

    // Without a clean slate on sign-out, HouseholdService still holds Alpha and
    // householdGuard skips reloading, so this second account would sail past the
    // create-household step into the first account's household.
    await registerAndLogIn(page, uniqueEmail('beta'));
    await createHousehold(page, `Beta ${suffix}`);

    const header = page.locator('header');
    await expect(header.getByText(`Beta ${suffix}`)).toBeVisible();
    await expect(header.getByText(`Alpha ${suffix}`)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Household' })).toHaveCount(0);
  });

  test('warns when a new household reuses an existing name, without blocking it', async ({
    page,
  }) => {
    const name = `Duplicate ${Date.now()}`;
    await signUpWithHousehold(page, { emailPrefix: 'dup', householdName: name });

    await page.goto('/household/create');
    await page.getByLabel('Household name').fill(name);
    await expect(page.getByText('Same name as an existing household')).toBeVisible();

    // A warning, not a validation error: creating it is still allowed.
    await expect(page.getByRole('button', { name: 'Create household' })).toBeEnabled();
    // And the page is no longer a dead end for someone who already has one.
    await expect(page.getByRole('link', { name: 'Cancel' })).toBeVisible();
  });
});
