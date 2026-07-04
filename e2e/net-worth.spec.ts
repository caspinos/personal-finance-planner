import { expect, test } from '@playwright/test';

import { signUpWithHousehold } from './support/auth';
import { addValuationFromAccountCard, createAccount, expectAccountValue, expectTotalNetWorth } from './support/net-worth';

test.describe('Net worth', () => {
  test.beforeEach(async ({ page }) => {
    await signUpWithHousehold(page, {
      emailPrefix: 'networth',
      householdName: `Household ${Date.now()}`,
    });
    await page.goto('/net-worth');
    await expect(page.getByText('No asset accounts yet')).toBeVisible();
  });

  test('creates an account and records a valuation, updating total net worth', async ({
    page,
  }) => {
    await createAccount(page, { name: 'Checking account' });
    await addValuationFromAccountCard(page, { account: 'Checking account', value: '500' });

    await page.getByRole('link', { name: 'Back to net worth' }).click();
    await expect(page).toHaveURL('/net-worth');

    await expectAccountValue(page, 'Checking account', '500.00 PLN');
    await expectTotalNetWorth(page, '500.00');
  });

  test('treats a liability account as a negative contribution to net worth', async ({ page }) => {
    await createAccount(page, { name: 'Checking account' });
    await addValuationFromAccountCard(page, { account: 'Checking account', value: '500' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    await createAccount(page, { name: 'Credit card', type: 'Liability' });
    await addValuationFromAccountCard(page, { account: 'Credit card', value: '200' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    await expectAccountValue(page, 'Credit card', '-200.00 PLN');
    await expectTotalNetWorth(page, '300.00');
  });

  test('shows account history and edits and deletes a valuation', async ({ page }) => {
    await createAccount(page, { name: 'Checking account' });
    await addValuationFromAccountCard(page, {
      account: 'Checking account',
      value: '500',
      note: 'Initial balance',
    });

    await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);
    await expect(page.getByText('Initial balance')).toBeVisible();
    await expect(page.getByText('500.00 PLN')).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/net-worth\/valuations\/.+\/edit/);
    await page.getByRole('spinbutton', { name: /^Value/ }).fill('650');
    await page.getByLabel('Note (optional)').fill('Updated balance');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);
    await expect(page.getByText('Updated balance')).toBeVisible();
    await expect(page.getByText('650.00 PLN')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No valuations recorded yet.')).toBeVisible();
  });

  test('archives and unarchives an account from its history page', async ({ page }) => {
    await createAccount(page, { name: 'Savings account' });
    await addValuationFromAccountCard(page, { account: 'Savings account', value: '300' });

    const accountUrl = page.url();

    await page.getByRole('button', { name: 'Archive account' }).click();
    await expect(page.getByRole('button', { name: 'Unarchive account' })).toBeVisible();
    await expect(page.getByText('Archived')).toBeVisible();

    await page.goto('/net-worth');
    await expect(page.getByText('No asset accounts yet')).toBeVisible();

    await page.goto(accountUrl);
    await page.getByRole('button', { name: 'Unarchive account' }).click();
    await expect(page.getByRole('button', { name: 'Archive account' })).toBeVisible();

    await page.goto('/net-worth');
    await expect(page.getByRole('heading', { name: 'Savings account', exact: true })).toBeVisible();
  });
});
