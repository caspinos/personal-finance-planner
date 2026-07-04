import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase.service';

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

const CURRENT_HOUSEHOLD_STORAGE_KEY = 'pfp.currentHouseholdId';

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly householdsSignal = signal<Household[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly currentHouseholdIdSignal = signal<string | null>(
    localStorage.getItem(CURRENT_HOUSEHOLD_STORAGE_KEY)
  );

  readonly households = this.householdsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly currentHousehold = computed<Household | null>(() => {
    const households = this.householdsSignal();
    const currentId = this.currentHouseholdIdSignal();
    return households.find((household) => household.id === currentId) ?? households[0] ?? null;
  });

  async loadHouseholds(): Promise<Household[]> {
    const { data, error } = await this.supabase
      .from('households')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    this.householdsSignal.set(data ?? []);
    this.loadedSignal.set(true);
    return this.householdsSignal();
  }

  selectHousehold(householdId: string): void {
    this.currentHouseholdIdSignal.set(householdId);
    localStorage.setItem(CURRENT_HOUSEHOLD_STORAGE_KEY, householdId);
  }

  async createHousehold(name: string): Promise<Household> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('You must be signed in to create a household.');
    }

    const { data, error } = await this.supabase
      .from('households')
      .insert({ name, created_by: userId })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.householdsSignal.update((households) => [...households, data]);
    this.selectHousehold(data.id);
    return data;
  }
}
