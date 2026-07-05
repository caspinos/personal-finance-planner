import { expect, type Page } from '@playwright/test';

/** Sets the household's base currency from the Rates page (owner only). */
export async function setBaseCurrency(page: Page, currency: string): Promise<void> {
  await page.goto('/rates');
  await page.getByLabel('Base currency').fill(currency);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(currency, { exact: true })).toBeVisible();
}

/** Adds an exchange rate from the Rates page and waits to land back on it. */
export async function addExchangeRate(
  page: Page,
  options: { currency: string; rateToPln: string; rateDate?: string; source?: string }
): Promise<void> {
  await page.goto('/rates');
  await page.getByRole('link', { name: 'New rate' }).click();
  await expect(page).toHaveURL('/rates/exchange-rates/new');

  await page.getByLabel('Currency').fill(options.currency);
  await page.getByLabel('Rate to PLN').fill(options.rateToPln);

  if (options.rateDate) {
    await page.getByLabel('Rate date').fill(options.rateDate);
  }

  if (options.source) {
    await page.getByLabel('Source (optional)').fill(options.source);
  }

  await page.getByRole('button', { name: 'Save rate' }).click();
  await expect(page).toHaveURL('/rates');
}

/** Adds a commodity price from the Rates page and waits to land back on it. */
export async function addCommodityPrice(
  page: Page,
  options: { commodity: string; price: string; currency?: string; priceDate?: string }
): Promise<void> {
  await page.goto('/rates');
  await page.getByRole('link', { name: 'New price' }).click();
  await expect(page).toHaveURL('/rates/commodity-prices/new');

  await page.getByLabel('Commodity').fill(options.commodity);
  await page.getByLabel('Price', { exact: true }).fill(options.price);

  if (options.currency) {
    await page.getByLabel('Currency').fill(options.currency);
  }

  if (options.priceDate) {
    await page.getByLabel('Price date').fill(options.priceDate);
  }

  await page.getByRole('button', { name: 'Save price' }).click();
  await expect(page).toHaveURL('/rates');
}
