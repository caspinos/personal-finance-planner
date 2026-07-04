import { expect, type Page } from '@playwright/test';

import { selectComboboxOption } from './budget';

/** Creates an asset account from the net worth page and waits to land back on it. */
export async function createAccount(
  page: Page,
  options: { name: string; type?: string; liquidity?: string; currency?: string }
): Promise<void> {
  await page.getByRole('link', { name: 'New account' }).click();
  await expect(page).toHaveURL('/net-worth/accounts/new');
  await page.getByLabel('Account name').fill(options.name);

  if (options.type) {
    await selectComboboxOption(page, 'Type', options.type);
  }

  if (options.liquidity) {
    await selectComboboxOption(page, 'Liquidity', options.liquidity);
  }

  if (options.currency) {
    await page.getByLabel('Currency').fill(options.currency);
  }

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/net-worth');
  await expect(page.getByRole('heading', { name: options.name, exact: true })).toBeVisible();
}

/** Adds a valuation from an account's card on the net worth page, landing on its history page. */
export async function addValuationFromAccountCard(
  page: Page,
  options: { account: string; value: string; contributionAmount?: string; note?: string }
): Promise<void> {
  const card = page.locator('[hlmCard]').filter({ hasText: options.account });
  await card.getByRole('link', { name: 'Add valuation' }).click();
  await expect(page).toHaveURL(/\/net-worth\/valuations\/new\?accountId=.+/);

  await page.getByRole('spinbutton', { name: /^Value/ }).fill(options.value);

  if (options.contributionAmount) {
    await page
      .getByLabel('Contribution since last valuation (optional)')
      .fill(options.contributionAmount);
  }

  if (options.note) {
    await page.getByLabel('Note (optional)').fill(options.note);
  }

  await page.getByRole('button', { name: 'Save valuation' }).click();
  await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);
}

/** Asserts the displayed value for a given account's card on the net worth page. */
export async function expectAccountValue(
  page: Page,
  accountName: string,
  expectedValue: string
): Promise<void> {
  const card = page.locator('[hlmCard]').filter({ hasText: accountName });
  await expect(card.getByText(expectedValue, { exact: true })).toBeVisible();
}

/** Asserts the displayed total net worth figure on the net worth page. */
export async function expectTotalNetWorth(page: Page, expectedTotal: string): Promise<void> {
  const card = page.locator('[hlmCard]').filter({ hasText: 'Total net worth' });
  await expect(card.getByText(expectedTotal, { exact: true })).toBeVisible();
}

/** Creates a holding from an account history page, waiting to land back on it. */
export async function createHolding(
  page: Page,
  options: { name: string; ticker?: string; currency?: string }
): Promise<void> {
  await page.getByRole('link', { name: 'New holding' }).click();
  await expect(page).toHaveURL(/\/net-worth\/holdings\/new\?accountId=.+/);
  await page.getByLabel('Name').fill(options.name);

  if (options.ticker) {
    await page.getByLabel('Ticker (optional)').fill(options.ticker);
  }

  if (options.currency) {
    await page.getByLabel('Currency').fill(options.currency);
  }

  await page.getByRole('button', { name: 'Create holding' }).click();
  await expect(page).toHaveURL(/\/net-worth\/accounts\/.+/);
  await expect(page.getByText(options.name)).toBeVisible();
}

/** Records a buy/sell transaction from a holding's history page, landing back on it. */
export async function recordHoldingTransaction(
  page: Page,
  options: {
    type?: 'Buy' | 'Sell';
    quantity: string;
    pricePerUnit: string;
    fee?: string;
    note?: string;
  }
): Promise<void> {
  await page.getByRole('link', { name: 'Record transaction' }).click();
  await expect(page).toHaveURL(/\/net-worth\/holdings\/transactions\/new\?holdingId=.+/);

  if (options.type === 'Sell') {
    await page.getByRole('button', { name: 'Sell' }).click();
  }

  await page.getByLabel('Quantity').fill(options.quantity);
  await page.getByLabel('Price per unit').fill(options.pricePerUnit);

  if (options.fee) {
    await page.getByLabel('Fee (optional)').fill(options.fee);
  }

  if (options.note) {
    await page.getByLabel('Note (optional)').fill(options.note);
  }

  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page).toHaveURL(/\/net-worth\/holdings\/.+/);
}
