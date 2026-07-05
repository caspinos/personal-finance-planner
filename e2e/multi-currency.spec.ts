import { expect, test } from '@playwright/test';

import { signUpWithHousehold } from './support/auth';
import { addValuationFromAccountCard, createAccount, expectTotalNetWorth } from './support/net-worth';
import { addCommodityPrice, addExchangeRate, setBaseCurrency } from './support/rates';

test.describe('Multi-currency & rates', () => {
  test.beforeEach(async ({ page }) => {
    await signUpWithHousehold(page, {
      emailPrefix: 'multicurrency',
      householdName: `Household ${Date.now()}`,
    });
  });

  test('defaults base currency to PLN and shows empty rate lists', async ({ page }) => {
    await page.goto('/rates');
    await expect(page.getByLabel('Base currency')).toHaveValue('PLN');
    await expect(page.getByText('No exchange rates yet.')).toBeVisible();
    await expect(page.getByText('No commodity prices yet.')).toBeVisible();
  });

  test('adds an exchange rate and it appears in the list', async ({ page }) => {
    await addExchangeRate(page, { currency: 'EUR', rateToPln: '4.00' });
    await expect(page.getByText('EUR', { exact: true })).toBeVisible();
    await expect(page.getByText('4.00 PLN')).toBeVisible();
  });

  test('edits and deletes an exchange rate', async ({ page }) => {
    await addExchangeRate(page, { currency: 'USD', rateToPln: '4.00' });

    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/rates\/exchange-rates\/.+\/edit/);
    await page.getByLabel('Rate to PLN').fill('4.10');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL('/rates');
    await expect(page.getByText('4.10 PLN')).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No exchange rates yet.')).toBeVisible();
  });

  test('adds a commodity price and it appears in the list', async ({ page }) => {
    await addCommodityPrice(page, { commodity: 'Gold (oz)', price: '240', currency: 'USD' });
    await expect(page.getByText('Gold (oz)')).toBeVisible();
    await expect(page.getByText('240.00 USD')).toBeVisible();
  });

  test('sets a non-PLN base currency and converts a PLN account value', async ({ page }) => {
    await addExchangeRate(page, { currency: 'EUR', rateToPln: '4.00' });
    await setBaseCurrency(page, 'EUR');

    await page.goto('/net-worth');
    await createAccount(page, { name: 'Checking account' });
    await addValuationFromAccountCard(page, { account: 'Checking account', value: '400' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    // 400 PLN / 4.00 (EUR->PLN rate) = 100 EUR
    await expectTotalNetWorth(page, '100.00', 'EUR');
  });

  test('converts a foreign-currency account into the PLN base currency total', async ({ page }) => {
    // Base currency stays PLN (default); account is opened in EUR.
    await addExchangeRate(page, { currency: 'EUR', rateToPln: '4.00' });

    await page.goto('/net-worth');
    await createAccount(page, { name: 'Euro savings', currency: 'EUR' });
    await addValuationFromAccountCard(page, { account: 'Euro savings', value: '100' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    // 100 EUR * 4.00 = 400 PLN
    await expectTotalNetWorth(page, '400.00');
  });

  test('shows a missing-rate warning instead of a wrong total', async ({ page }) => {
    await page.goto('/net-worth');
    await createAccount(page, { name: 'USD wallet', currency: 'USD' });
    await addValuationFromAccountCard(page, { account: 'USD wallet', value: '100' });
    await page.getByRole('link', { name: 'Back to net worth' }).click();

    // Base currency is PLN, account currency is USD, no rate has been added, so
    // the account's raw amount is shown unconverted rather than silently wrong.
    await expect(page.getByText(/No exchange rate/)).toBeVisible();
    await expect(page.getByText('add one')).toBeVisible();
    await expectTotalNetWorth(page, '100.00');
  });
});
