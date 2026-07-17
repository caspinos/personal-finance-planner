import { expect, test } from '@playwright/test';

import { signUpWithHousehold } from './support/auth';
import {
  createEnvelope,
  expectEnvelopeBalance,
  recordTransaction,
  transferFunds,
} from './support/budget';

test.describe('Budget envelopes', () => {
  test.beforeEach(async ({ page }) => {
    await signUpWithHousehold(page, {
      emailPrefix: 'budget',
      householdName: `Household ${Date.now()}`,
    });
    await page.goto('/budget');
    await expect(page.getByText('No envelopes yet')).toBeVisible();
  });

  test('creates an envelope and records an income transaction', async ({ page }) => {
    await createEnvelope(page, 'Groceries');

    await recordTransaction(page, {
      type: 'Income',
      envelope: 'Groceries',
      amount: '500',
      name: 'Paycheck',
    });

    await expectEnvelopeBalance(page, 'Groceries', '500.00');
  });

  test('records an expense and shows a reduced balance', async ({ page }) => {
    await createEnvelope(page, 'Groceries');

    await recordTransaction(page, {
      type: 'Income',
      envelope: 'Groceries',
      amount: '500',
      name: 'Paycheck',
    });
    await recordTransaction(page, {
      type: 'Expense',
      envelope: 'Groceries',
      amount: '120',
      name: 'Supermarket run',
    });

    await expectEnvelopeBalance(page, 'Groceries', '380.00');
  });

  test('shows envelope history and edits and deletes a transaction', async ({ page }) => {
    await createEnvelope(page, 'Groceries');
    await recordTransaction(page, {
      type: 'Income',
      envelope: 'Groceries',
      amount: '500',
      name: 'Initial funding',
    });

    const card = page.locator('[hlmCard]').filter({ hasText: 'Groceries' });
    await card.getByRole('link', { name: 'View history' }).click();
    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);
    await expect(page.getByText('Initial funding')).toBeVisible();
    await expect(page.getByText('500.00 PLN')).toBeVisible();

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/budget\/transactions\/.+\/edit/);
    await page.getByLabel('Amount').fill('650');
    await page.getByLabel('Name').fill('Adjusted funding');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);
    await expect(page.getByText('Adjusted funding')).toBeVisible();
    await expect(page.getByText('650.00 PLN')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No activity recorded for this month.')).toBeVisible();
    await expect(page.getByText('0.00', { exact: true })).toBeVisible();
  });

  test('shows envelope history and edits and deletes a transfer', async ({ page }) => {
    await createEnvelope(page, 'Groceries');
    await createEnvelope(page, 'Fun money');

    await recordTransaction(page, {
      type: 'Income',
      envelope: 'Groceries',
      amount: '500',
      name: 'Paycheck',
    });
    await transferFunds(page, { from: 'Groceries', to: 'Fun money', amount: '100' });

    const card = page.locator('[hlmCard]').filter({ hasText: 'Groceries' });
    await card.getByRole('link', { name: 'View history' }).click();
    await expect(page.getByText('Transfer to Fun money')).toBeVisible();
    await expect(page.getByText('-100.00 PLN')).toBeVisible();

    let transferRow = page.locator('li').filter({ hasText: 'Transfer to Fun money' });
    await transferRow.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/budget\/transfers\/.+\/edit/);
    await page.getByLabel('Amount').fill('125');
    await page.getByLabel('Description (optional)').fill('Adjusted transfer');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);
    await expect(page.getByText('Adjusted transfer')).toBeVisible();
    await expect(page.getByText('-125.00 PLN')).toBeVisible();

    transferRow = page.locator('li').filter({ hasText: 'Adjusted transfer' });
    page.once('dialog', (dialog) => dialog.accept());
    await transferRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Transfer to Fun money')).not.toBeVisible();
  });

  test('transfers funds between envelopes and carries balances into the next month', async ({
    page,
  }) => {
    await createEnvelope(page, 'Groceries');
    await createEnvelope(page, 'Fun money');

    await recordTransaction(page, {
      type: 'Income',
      envelope: 'Groceries',
      amount: '500',
      name: 'Paycheck',
    });
    await transferFunds(page, { from: 'Groceries', to: 'Fun money', amount: '100' });

    await expectEnvelopeBalance(page, 'Groceries', '400.00');
    await expectEnvelopeBalance(page, 'Fun money', '100.00');

    await page.getByRole('button', { name: 'Next month' }).click();

    await expectEnvelopeBalance(page, 'Groceries', '400.00');
    await expectEnvelopeBalance(page, 'Fun money', '100.00');
  });

  test('amortizes a large expense, charging the budget one monthly slice at a time', async ({
    page,
  }) => {
    await createEnvelope(page, 'Car insurance');

    // A yearly premium paid in one go, spread across 12 months.
    await recordTransaction(page, {
      type: 'Expense',
      envelope: 'Car insurance',
      amount: '1200',
      name: 'Annual OC premium',
      amortizeMonths: '12',
    });

    // Only the current month's slice (1200 / 12 = 100) hits the budget, not 1200.
    await expectEnvelopeBalance(page, 'Car insurance', '-100.00');

    const card = page.locator('[hlmCard]').filter({ hasText: 'Car insurance' });
    await card.getByRole('link', { name: 'View history' }).click();
    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);

    // The payment record stays in history, marked as amortized and budget-neutral.
    const paymentRow = page.locator('li').filter({ hasText: 'Amortized · 12 mo' });
    await expect(paymentRow).toBeVisible();
    // Locale-robust: grouping may be a comma, a (non-breaking) space, or absent.
    await expect(paymentRow.getByText(/1[\s ,]?200\.00\s*PLN/)).toBeVisible();

    // The derived slice is what actually reduces the budget.
    await expect(page.getByText('-100.00 PLN')).toBeVisible();

    // Editing the header re-derives the slices: 2400 / 12 = 200 per month.
    await paymentRow.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/budget\/transactions\/.+\/edit/);
    await page.getByLabel('Amount').fill('2400');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);
    await expect(page.getByText('-200.00 PLN')).toBeVisible();
  });

  test('archives and unarchives an envelope from its history page', async ({ page }) => {
    await createEnvelope(page, 'Old envelope');

    const card = page.locator('[hlmCard]').filter({ hasText: 'Old envelope' });
    await card.getByRole('link', { name: 'View history' }).click();
    await expect(page).toHaveURL(/\/budget\/envelopes\/.+/);
    const envelopeUrl = page.url();

    await page.getByRole('button', { name: 'Archive envelope' }).click();
    await expect(page.getByRole('button', { name: 'Unarchive envelope' })).toBeVisible();
    await expect(page.getByText('Archived')).toBeVisible();

    await page.goto('/budget');
    await expect(page.getByText('No envelopes yet')).toBeVisible();

    await page.goto(envelopeUrl);
    await page.getByRole('button', { name: 'Unarchive envelope' }).click();
    await expect(page.getByRole('button', { name: 'Archive envelope' })).toBeVisible();

    await page.goto('/budget');
    await expect(page.getByRole('heading', { name: 'Old envelope', exact: true })).toBeVisible();
  });
});
