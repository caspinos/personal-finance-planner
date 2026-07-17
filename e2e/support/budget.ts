import { expect, type Page } from '@playwright/test';

/** Opens a spartan/ui combobox by its accessible (field) name and picks an option. */
export async function selectComboboxOption(
  page: Page,
  comboboxName: string,
  optionName: string,
): Promise<void> {
  await page.getByRole('combobox', { name: comboboxName }).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

/** Creates an envelope from the budget page and waits to land back on it. */
export async function createEnvelope(page: Page, name: string): Promise<void> {
  await page.getByRole('link', { name: 'New envelope' }).click();
  await expect(page).toHaveURL('/budget/envelopes/new');
  await page.getByLabel('Envelope name').fill(name);
  await page.getByRole('button', { name: 'Create envelope' }).click();
  await expect(page).toHaveURL('/budget');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

/** Records an expense/income transaction from the budget page. Name is required by the form. */
export async function recordTransaction(
  page: Page,
  options: {
    type: 'Expense' | 'Income';
    envelope: string;
    amount: string;
    name: string;
    /** When set on an expense, spreads it across this many months (amortization). */
    amortizeMonths?: string;
  },
): Promise<void> {
  await page.getByRole('link', { name: 'Record transaction' }).click();
  await expect(page).toHaveURL('/budget/transactions/new');

  if (options.type === 'Income') {
    await page.getByRole('button', { name: 'Income' }).click();
  }

  await selectComboboxOption(page, 'Envelope', options.envelope);
  await page.getByLabel('Amount').fill(options.amount);
  await page.getByLabel('Name').fill(options.name);

  if (options.type === 'Expense' && options.amortizeMonths) {
    await page.getByLabel('Spread this expense over time').check();
    await page.getByLabel('Number of months').fill(options.amortizeMonths);
  }

  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page).toHaveURL('/budget');
}

/** Transfers funds between two envelopes from the budget page. */
export async function transferFunds(
  page: Page,
  options: { from: string; to: string; amount: string },
): Promise<void> {
  await page.getByRole('link', { name: 'Transfer' }).click();
  await expect(page).toHaveURL('/budget/transfers/new');

  await selectComboboxOption(page, 'From envelope', options.from);
  await selectComboboxOption(page, 'To envelope', options.to);
  await page.getByLabel('Amount').fill(options.amount);

  await page.getByRole('button', { name: 'Transfer' }).click();
  await expect(page).toHaveURL('/budget');
}

/** Asserts the displayed balance (in PLN) for a given envelope's card on the budget page. */
export async function expectEnvelopeBalance(
  page: Page,
  envelopeName: string,
  expectedBalance: string,
): Promise<void> {
  const card = page.locator('[hlmCard]').filter({ hasText: envelopeName });
  await expect(card.getByText(`${expectedBalance} PLN`, { exact: true })).toBeVisible();
}
