import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';

import { Budget } from './budget';
import { BudgetService, Envelope, EnvelopeBalance } from '../../core/budget/budget.service';
import { HouseholdService } from '../../core/household/household.service';

class FakeTranslocoLoader implements TranslocoLoader {
  getTranslation(): Promise<Translation> {
    return Promise.resolve({});
  }
}

function envelope(id: string, name: string): Envelope {
  return {
    id,
    household_id: 'household-1',
    name,
    archived: false,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  };
}

/** Stands in for the loaded state the budget page renders from. */
function fakeBudgetService(input: {
  envelopes: Envelope[];
  balances: Record<string, EnvelopeBalance>;
  spending: Record<string, number>;
}) {
  return {
    envelopes: signal(input.envelopes),
    activeEnvelopes: signal(input.envelopes),
    balances: signal(input.balances),
    monthlySpending: signal(input.spending),
    recurringRules: signal([]),
    loadEnvelopes: () => Promise.resolve(input.envelopes),
    loadBalances: () => Promise.resolve(input.balances),
    loadMonthlySpending: () => Promise.resolve(input.spending),
    loadRecurringRules: () => Promise.resolve([]),
    processDueRecurringRules: () => Promise.resolve(0),
  };
}

async function renderBudget(input: {
  envelopes: Envelope[];
  balances: Record<string, EnvelopeBalance>;
  spending: Record<string, number>;
}) {
  TestBed.configureTestingModule({
    imports: [Budget],
    providers: [
      provideRouter([]),
      provideTransloco({
        config: { availableLangs: ['en'], defaultLang: 'en', fallbackLang: 'en' },
        loader: FakeTranslocoLoader,
      }),
      { provide: BudgetService, useValue: fakeBudgetService(input) },
      { provide: HouseholdService, useValue: { currentHousehold: signal(null) } },
    ],
  });

  const fixture = TestBed.createComponent(Budget);
  // The page loads its month in the constructor; let that settle before reading
  // the rendered tiles.
  await fixture.whenStable();
  fixture.detectChanges();

  return { fixture, root: fixture.nativeElement as HTMLElement };
}

/** The two washes behind a tile, in template order: budget fill, then the month marker. */
function indicators(root: HTMLElement, index = 0) {
  const tile = root.querySelectorAll('li[data-slot="card"]')[index];
  const washes = tile.querySelectorAll<HTMLElement>(':scope > [aria-hidden="true"]');
  return { fill: washes[0], marker: washes[1] };
}

describe('Budget envelope tiles', () => {
  beforeEach(() => {
    // Mid-June: half the month gone, so a 50% usage sits exactly on pace.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 5, 15));
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills the tile to the share of the budget used and marks the month elapsed', async () => {
    const { root } = await renderBudget({
      envelopes: [envelope('envelope-1', 'Groceries')],
      balances: { 'envelope-1': { balance: 600, balance_in_base: null } },
      spending: { 'envelope-1': 400 },
    });

    const { fill, marker } = indicators(root);

    expect(fill.style.width).toBe('40%');
    expect(fill.classList).toContain('bg-budget-on-track');
    expect(fill.classList).not.toContain('bg-budget-over-pace');
    expect(marker.style.left).toBe('50%');
  });

  it('turns amber once spending has outrun the month', async () => {
    const { root } = await renderBudget({
      envelopes: [envelope('envelope-1', 'Groceries')],
      balances: { 'envelope-1': { balance: 400, balance_in_base: null } },
      spending: { 'envelope-1': 600 },
    });

    const { fill } = indicators(root);

    expect(fill.style.width).toBe('60%');
    expect(fill.classList).toContain('bg-budget-over-pace');
  });

  it('drops the marker for a month that is not running', async () => {
    const { fixture, root } = await renderBudget({
      envelopes: [envelope('envelope-1', 'Groceries')],
      balances: { 'envelope-1': { balance: 600, balance_in_base: null } },
      spending: { 'envelope-1': 400 },
    });

    root.querySelector<HTMLButtonElement>('[aria-label="Previous month"]')!.click();
    fixture.detectChanges();

    const { fill, marker } = indicators(root);

    expect(marker).toBeUndefined();
    // A finished month only turns amber when the envelope was actually overspent.
    expect(fill.classList).toContain('bg-budget-on-track');
  });
});
