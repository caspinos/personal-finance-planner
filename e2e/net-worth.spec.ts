import { expect, test } from '@playwright/test';

import { signUpWithHousehold } from './support/auth';
import {
  addValuationFromAccountCard,
  createAccount,
  createHolding,
  expectAccountValue,
  expectTotalNetWorth,
  recordBulkValuations,
  recordHoldingTransaction,
} from './support/net-worth';

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

  test('groups accounts by type and filters by liquidity', async ({ page }) => {
    await createAccount(page, { name: 'Checking account' });
    await addValuationFromAccountCard(page, { account: 'Checking account', value: '500' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    await createAccount(page, { name: 'Credit card', type: 'Liability' });
    await addValuationFromAccountCard(page, { account: 'Credit card', value: '200' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    await expect(page.getByRole('heading', { name: 'Bank account', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Liability', exact: true })).toBeVisible();

    await page.getByRole('combobox', { name: 'Filter by liquidity' }).click();
    await page.getByRole('option', { name: 'Liability', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Liability', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bank account', exact: true })).not.toBeVisible();
    await expect(page.getByText('Credit card')).toBeVisible();
    await expect(page.getByText('Checking account')).not.toBeVisible();

    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(page.getByRole('heading', { name: 'Bank account', exact: true })).toBeVisible();
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

  test('records buy and sell holding transactions and computes the position', async ({
    page,
  }) => {
    await createAccount(page, { name: 'Brokerage', type: 'Investment account' });

    const card = page.locator('[hlmCard]').filter({ hasText: 'Brokerage' });
    await card.getByRole('link', { name: 'View history' }).click();
    await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);

    await createHolding(page, { name: 'Acme Corp', ticker: 'ACME' });
    await expect(page.getByText('0 units')).toBeVisible();

    const holdingRow = page.locator('li').filter({ hasText: 'Acme Corp' });
    await holdingRow.getByRole('link', { name: 'View history' }).click();
    await expect(page).toHaveURL(/\/net-worth\/holdings\/.+/);

    await recordHoldingTransaction(page, { quantity: '10', pricePerUnit: '20' });
    await expect(page.getByText('Buy 10 @ 20')).toBeVisible();
    await expect(page.getByText('200.00 PLN')).toBeVisible();

    await recordHoldingTransaction(page, { type: 'Sell', quantity: '4', pricePerUnit: '25' });
    await expect(page.getByText('Sell 4 @ 25')).toBeVisible();
    await expect(page.getByText('150.00 PLN')).toBeVisible();
    await expect(page.getByText('30.00 PLN')).toBeVisible();

    await page.getByRole('link', { name: 'Back to account' }).click();
    await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);
    await expect(page.getByText('6 units')).toBeVisible();
  });

  test('edits and deletes a holding transaction', async ({ page }) => {
    await createAccount(page, { name: 'Brokerage', type: 'Investment account' });

    const card = page.locator('[hlmCard]').filter({ hasText: 'Brokerage' });
    await card.getByRole('link', { name: 'View history' }).click();

    await createHolding(page, { name: 'Acme Corp' });

    const holdingRow = page.locator('li').filter({ hasText: 'Acme Corp' });
    await holdingRow.getByRole('link', { name: 'View history' }).click();

    await recordHoldingTransaction(page, {
      quantity: '10',
      pricePerUnit: '20',
      note: 'Initial buy',
    });

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/net-worth\/holdings\/transactions\/.+\/edit/);
    await page.getByLabel('Quantity').fill('15');
    await page.getByLabel('Note (optional)').fill('Adjusted buy');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/net-worth\/holdings\/.+/);
    await expect(page.getByText('Buy 15 @ 20')).toBeVisible();
    await expect(page.getByText('Adjusted buy')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No transactions recorded yet.')).toBeVisible();
  });

  test('values every account at once from the bulk valuation grid', async ({ page }) => {
    await createAccount(page, { name: 'Checking account' });
    await createAccount(page, { name: 'Credit card', type: 'Liability' });

    await recordBulkValuations(page, [
      { account: 'Checking account', value: '1200', flows: '200' },
      { account: 'Credit card', value: '300' },
    ]);

    await expectAccountValue(page, 'Checking account', '1,200.00 PLN');
    await expectAccountValue(page, 'Credit card', '-300.00 PLN');
    await expectTotalNetWorth(page, '900.00');

    // The flows entered in the grid land on the account's valuation history.
    await page
      .locator('[hlmCard]')
      .filter({ hasText: 'Checking account' })
      .getByRole('link', { name: 'View history' })
      .click();
    await expect(page.getByText('Contribution 200.00')).toBeVisible();
  });

  test('prefills the bulk grid for a date already valued and overwrites it on save', async ({
    page,
  }) => {
    await createAccount(page, { name: 'Checking account' });
    await recordBulkValuations(page, [{ account: 'Checking account', value: '1200' }]);

    await page.getByRole('link', { name: 'Update all valuations' }).click();
    await expect(page).toHaveURL('/net-worth/valuations/bulk');

    const valueField = page.getByRole('spinbutton', {
      name: 'Value for Checking account (PLN)',
    });
    await expect(valueField).toHaveValue('1200');
    await expect(page.getByText('Valuations already recorded for this date')).toBeVisible();

    // Saving the same date again must update the existing row rather than fail
    // on the account + date uniqueness constraint.
    await valueField.fill('1500');
    await page.getByRole('button', { name: 'Save valuations' }).click();

    await expect(page).toHaveURL('/net-worth');
    await expectAccountValue(page, 'Checking account', '1,500.00 PLN');
    await expectTotalNetWorth(page, '1,500.00');
  });

  test('skips accounts left blank in the bulk valuation grid', async ({ page }) => {
    await createAccount(page, { name: 'Checking account' });
    await createAccount(page, { name: 'Savings account' });

    await page.getByRole('link', { name: 'Update all valuations' }).click();
    await expect(page).toHaveURL('/net-worth/valuations/bulk');

    // Submitting an entirely blank grid records nothing and explains why.
    await page.getByRole('button', { name: 'Save valuations' }).click();
    await expect(page.getByText('Enter a value for at least one account.')).toBeVisible();
    await expect(page).toHaveURL('/net-worth/valuations/bulk');

    await page.getByRole('spinbutton', { name: 'Value for Checking account (PLN)' }).fill('400');
    await page.getByRole('button', { name: 'Save valuations' }).click();

    await expect(page).toHaveURL('/net-worth');
    await expectAccountValue(page, 'Checking account', '400.00 PLN');
    await expectTotalNetWorth(page, '400.00');

    const savings = page.locator('[hlmCard]').filter({ hasText: 'Savings account' });
    await expect(savings.getByText('No valuation recorded yet')).toBeVisible();
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
