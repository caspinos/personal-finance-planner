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

    await recordTransaction(page, { type: 'Income', envelope: 'Groceries', amount: '500' });

    await expectEnvelopeBalance(page, 'Groceries', '500.00');
  });

  test('records an expense and shows a reduced balance', async ({ page }) => {
    await createEnvelope(page, 'Groceries');

    await recordTransaction(page, { type: 'Income', envelope: 'Groceries', amount: '500' });
    await recordTransaction(page, { type: 'Expense', envelope: 'Groceries', amount: '120' });

    await expectEnvelopeBalance(page, 'Groceries', '380.00');
  });

  test('transfers funds between envelopes and carries balances into the next month', async ({
    page,
  }) => {
    await createEnvelope(page, 'Groceries');
    await createEnvelope(page, 'Fun money');

    await recordTransaction(page, { type: 'Income', envelope: 'Groceries', amount: '500' });
    await transferFunds(page, { from: 'Groceries', to: 'Fun money', amount: '100' });

    await expectEnvelopeBalance(page, 'Groceries', '400.00');
    await expectEnvelopeBalance(page, 'Fun money', '100.00');

    await page.getByRole('button', { name: 'Next month' }).click();

    await expectEnvelopeBalance(page, 'Groceries', '400.00');
    await expectEnvelopeBalance(page, 'Fun money', '100.00');
  });
});
