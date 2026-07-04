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
  await expect(page.getByText(expectedTotal, { exact: true })).toBeVisible();
}
