import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { BudgetService } from './budget.service';
import { AuthService } from '../auth/auth.service';
import { HouseholdService } from '../household/household.service';
import { SupabaseService } from '../supabase.service';

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * A Supabase client whose every response is held open, so a test can decide the
 * order in which a month's two queries answer. One deferred is handed out per
 * call, per endpoint, in call order.
 */
function fakeSupabase() {
  const calls: { balances: Deferred[]; charges: Deferred[]; expenses: Deferred[] } = {
    balances: [],
    charges: [],
    expenses: [],
  };

  const next = (endpoint: keyof typeof calls) => {
    const pending = deferred();
    calls[endpoint].push(pending);
    return pending.promise;
  };

  // The expense query is a postgrest builder: every filter returns the builder,
  // and awaiting it resolves the response.
  const expenseQuery = () => {
    const promise = next('expenses');
    const builder: Record<string, unknown> = {
      then: (onFulfilled: (value: unknown) => unknown, onRejected: (reason: unknown) => unknown) =>
        promise.then(onFulfilled, onRejected),
    };
    for (const method of ['select', 'eq', 'is', 'gte', 'lte']) {
      builder[method] = () => builder;
    }
    return builder;
  };

  return {
    calls,
    client: {
      from: () => expenseQuery(),
      rpc: (name: string) => next(name === 'get_envelope_balances' ? 'balances' : 'charges'),
    },
  };
}

/** Lets every already-settled promise run its continuations. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function balancesRow(balance: number) {
  return { data: [{ envelope_id: 'envelope-1', balance, balance_in_base: null }] };
}

function expenseRow(amount: number) {
  return { data: [{ envelope_id: 'envelope-1', amount }] };
}

function serviceWith(supabase: ReturnType<typeof fakeSupabase>): BudgetService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: supabase },
      {
        provide: HouseholdService,
        useValue: { currentHousehold: signal({ id: 'household-1', base_currency: 'PLN' }) },
      },
      { provide: AuthService, useValue: { user: signal({ id: 'user-1' }) } },
    ],
  });
  return TestBed.inject(BudgetService);
}

const JUNE = { from: new Date(2026, 5, 1), to: new Date(2026, 5, 30) };
const JULY = { from: new Date(2026, 6, 1), to: new Date(2026, 6, 31) };

describe('BudgetService.loadMonth', () => {
  it('publishes the balances and the spending of a month together', async () => {
    const supabase = fakeSupabase();
    const budget = serviceWith(supabase);

    const load = budget.loadMonth(JUNE);

    supabase.calls.expenses[0].resolve(expenseRow(400));
    supabase.calls.charges[0].resolve({ data: [] });
    await flushMicrotasks();

    // The balances have not answered yet, so neither signal may have moved:
    // half a month on screen would draw a ratio out of two different months.
    expect(budget.balances()).toEqual({});
    expect(budget.monthlySpending()).toEqual({});

    supabase.calls.balances[0].resolve(balancesRow(600));
    await load;

    expect(budget.balances()['envelope-1'].balance).toBe(600);
    expect(budget.monthlySpending()['envelope-1']).toBe(400);
  });

  it("counts a month's amortization slices alongside its plain expenses", async () => {
    const supabase = fakeSupabase();
    const budget = serviceWith(supabase);

    const load = budget.loadMonth(JUNE);

    supabase.calls.balances[0].resolve(balancesRow(600));
    supabase.calls.expenses[0].resolve(expenseRow(120));
    // The lump payment behind this slice is budget-neutral and is filtered out
    // of the expense query; only the slice due this month consumes the budget.
    supabase.calls.charges[0].resolve({
      data: [
        { envelope_id: 'envelope-1', amount: 83.33 },
        { envelope_id: 'envelope-2', amount: 50 },
      ],
    });
    await load;

    expect(budget.monthlySpending()['envelope-1']).toBeCloseTo(203.33);
    expect(budget.monthlySpending()['envelope-2']).toBe(50);
  });

  it('leaves both signals untouched when one of the two queries fails', async () => {
    const supabase = fakeSupabase();
    const budget = serviceWith(supabase);

    const load = budget.loadMonth(JUNE);

    supabase.calls.balances[0].resolve(balancesRow(600));
    supabase.calls.charges[0].resolve({ data: [] });
    supabase.calls.expenses[0].reject(new Error('network is down'));

    await expect(load).rejects.toThrow('network is down');
    expect(budget.balances()).toEqual({});
    expect(budget.monthlySpending()).toEqual({});
  });

  it('never lets an abandoned month land on top of the one now on screen', async () => {
    const supabase = fakeSupabase();
    const budget = serviceWith(supabase);

    // Two month switches in flight; the newer one answers first.
    const abandoned = budget.loadMonth(JUNE);
    const current = budget.loadMonth(JULY);

    supabase.calls.balances[1].resolve(balancesRow(100));
    supabase.calls.expenses[1].resolve(expenseRow(50));
    supabase.calls.charges[1].resolve({ data: [] });
    await current;

    supabase.calls.balances[0].resolve(balancesRow(600));
    supabase.calls.expenses[0].resolve(expenseRow(400));
    supabase.calls.charges[0].resolve({ data: [] });
    await abandoned;

    expect(budget.balances()['envelope-1'].balance).toBe(100);
    expect(budget.monthlySpending()['envelope-1']).toBe(50);
  });
});
