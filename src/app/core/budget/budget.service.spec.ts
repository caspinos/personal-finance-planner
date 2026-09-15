import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { BudgetService } from './budget.service';
import { AuthService } from '../auth/auth.service';
import { HouseholdService } from '../household/household.service';
import { SupabaseService } from '../supabase.service';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Hands out one controllable response per `rpc` call, in call order. */
function fakeSupabase(responses: Deferred<unknown>[]) {
  let call = 0;
  return {
    client: {
      rpc: () => responses[call++].promise,
    },
  };
}

describe('BudgetService month-scoped loads', () => {
  it('ignores a stale balances response that resolves after a newer one', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: fakeSupabase([first, second]) },
        {
          provide: HouseholdService,
          useValue: { currentHousehold: signal({ id: 'household-1', base_currency: 'PLN' }) },
        },
        { provide: AuthService, useValue: { user: signal({ id: 'user-1' }) } },
      ],
    });

    const budget = TestBed.inject(BudgetService);

    // Two month switches in flight; the newer one answers first.
    const stale = budget.loadBalances(new Date(2026, 5, 30));
    const latest = budget.loadBalances(new Date(2026, 6, 31));

    second.resolve({ data: [{ envelope_id: 'envelope-1', balance: 200, balance_in_base: null }] });
    await latest;

    first.resolve({ data: [{ envelope_id: 'envelope-1', balance: 999, balance_in_base: null }] });
    await stale;

    expect(budget.balances()['envelope-1'].balance).toBe(200);
  });
});
