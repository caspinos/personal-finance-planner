import { TestBed } from '@angular/core/testing';

import { Household, HouseholdService } from './household.service';
import { SupabaseService } from '../supabase.service';

const STORAGE_KEY = 'pfp.currentHouseholdId';

function household(id: string, name: string): Household {
  return {
    id,
    name,
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    base_currency: 'PLN',
  };
}

/** Minimal stand-in for the bits of the Supabase client these paths touch. */
function fakeSupabase(rows: Household[]) {
  return {
    client: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    },
  };
}

function serviceWith(rows: Household[]): HouseholdService {
  TestBed.configureTestingModule({
    providers: [{ provide: SupabaseService, useValue: fakeSupabase(rows) }],
  });
  return TestBed.inject(HouseholdService);
}

describe('HouseholdService', () => {
  const first = household('household-1', 'Home');
  const second = household('household-2', 'Rental');

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps a stored selection that still resolves', async () => {
    localStorage.setItem(STORAGE_KEY, second.id);

    const households = serviceWith([first, second]);
    await households.loadHouseholds();

    expect(households.currentHousehold()?.id).toBe(second.id);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(second.id);
  });

  it('drops a stored selection the account can no longer see', async () => {
    localStorage.setItem(STORAGE_KEY, 'household-gone');

    const households = serviceWith([first]);
    await households.loadHouseholds();

    // Falls back to the first household instead of rendering an empty app.
    expect(households.currentHousehold()?.id).toBe(first.id);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('falls back to the first household when nothing is stored', async () => {
    const households = serviceWith([first, second]);
    await households.loadHouseholds();

    expect(households.currentHousehold()?.id).toBe(first.id);
  });

  it('persists an explicit selection', async () => {
    const households = serviceWith([first, second]);
    await households.loadHouseholds();

    households.selectHousehold(second.id);

    expect(households.currentHousehold()?.id).toBe(second.id);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(second.id);
  });

  it('reports whether the account has more than one household', async () => {
    const households = serviceWith([first]);
    await households.loadHouseholds();
    expect(households.hasMultipleHouseholds()).toBe(false);

    TestBed.resetTestingModule();
    const many = serviceWith([first, second]);
    await many.loadHouseholds();
    expect(many.hasMultipleHouseholds()).toBe(true);
  });
});
