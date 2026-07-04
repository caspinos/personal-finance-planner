import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { HouseholdService } from '../household/household.service';
import { SupabaseService } from '../supabase.service';

export type AssetAccountType =
  | 'bank'
  | 'investment'
  | 'cash'
  | 'real_estate'
  | 'vehicle'
  | 'precious_metals'
  | 'currency'
  | 'other_asset'
  | 'liability';

export type AssetLiquidityClass = 'cash' | 'liquid' | 'restricted' | 'illiquid' | 'liability';

export interface AssetAccount {
  id: string;
  household_id: string;
  name: string;
  type: AssetAccountType;
  currency: string;
  institution: string | null;
  category: string | null;
  owner_name: string | null;
  liquidity: AssetLiquidityClass;
  archived: boolean;
  created_by: string;
  created_at: string;
}

export interface AssetValuation {
  id: string;
  household_id: string;
  asset_account_id: string;
  valued_on: string;
  value: number;
  currency: string;
  contribution_amount: number;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface NetWorthSummaryRow {
  account_id: string;
  account_name: string;
  account_type: AssetAccountType;
  currency: string;
  valuation_id: string | null;
  valued_on: string | null;
  value: number;
  signed_value: number;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class NetWorthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  private readonly accountsSignal = signal<AssetAccount[]>([]);
  private readonly summarySignal = signal<NetWorthSummaryRow[]>([]);

  readonly accounts = this.accountsSignal.asReadonly();
  readonly activeAccounts = computed(() => this.accountsSignal().filter((account) => !account.archived));
  readonly summary = this.summarySignal.asReadonly();
  readonly totalNetWorth = computed(() =>
    this.summarySignal().reduce((total, row) => total + row.signed_value, 0),
  );

  async loadAccounts(): Promise<AssetAccount[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('asset_accounts')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    this.accountsSignal.set(data ?? []);
    return this.accountsSignal();
  }

  async loadSummary(asOf: Date): Promise<NetWorthSummaryRow[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase.rpc('get_net_worth_summary', {
      p_household_id: householdId,
      p_as_of: toDateOnly(asOf),
    });

    if (error) {
      throw error;
    }

    const summary: NetWorthSummaryRow[] = [];
    for (const row of data ?? []) {
      summary.push({
        account_id: row.account_id,
        account_name: row.account_name,
        account_type: row.account_type,
        currency: row.currency,
        valuation_id: row.valuation_id,
        valued_on: row.valued_on,
        value: Number(row.value),
        signed_value: Number(row.signed_value),
      });
    }

    this.summarySignal.set(summary);
    return summary;
  }

  async loadAccount(accountId: string): Promise<AssetAccount> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('asset_accounts')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', accountId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async setAccountArchived(accountId: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('asset_accounts')
      .update({ archived })
      .eq('id', accountId);

    if (error) {
      throw error;
    }

    this.accountsSignal.update((accounts) =>
      accounts.map((account) => (account.id === accountId ? { ...account, archived } : account)),
    );
  }

  async createAccount(input: {
    name: string;
    type: AssetAccountType;
    currency: string;
    institution?: string;
    category?: string;
    ownerName?: string;
    liquidity: AssetLiquidityClass;
  }): Promise<AssetAccount> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('asset_accounts')
      .insert({
        household_id: householdId,
        name: input.name,
        type: input.type,
        currency: input.currency,
        institution: input.institution || null,
        category: input.category || null,
        owner_name: input.ownerName || null,
        liquidity: input.liquidity,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.accountsSignal.update((accounts) => [...accounts, data]);
    return data;
  }

  async recordValuation(input: {
    accountId: string;
    valuedOn: Date;
    value: number;
    currency: string;
    contributionAmount?: number;
    note?: string;
  }): Promise<AssetValuation> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('asset_valuations')
      .insert({
        household_id: householdId,
        asset_account_id: input.accountId,
        valued_on: toDateOnly(input.valuedOn),
        value: input.value,
        currency: input.currency,
        contribution_amount: input.contributionAmount ?? 0,
        note: input.note || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async loadValuation(valuationId: string): Promise<AssetValuation> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('asset_valuations')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', valuationId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async loadValuations(accountId: string): Promise<AssetValuation[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('asset_valuations')
      .select('*')
      .eq('household_id', householdId)
      .eq('asset_account_id', accountId)
      .order('valued_on', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data ?? [];
  }

  async updateValuation(
    valuationId: string,
    input: {
      accountId: string;
      valuedOn: Date;
      value: number;
      currency: string;
      contributionAmount?: number;
      note?: string;
    },
  ): Promise<AssetValuation> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('asset_valuations')
      .update({
        asset_account_id: input.accountId,
        valued_on: toDateOnly(input.valuedOn),
        value: input.value,
        currency: input.currency,
        contribution_amount: input.contributionAmount ?? 0,
        note: input.note || null,
      })
      .eq('household_id', householdId)
      .eq('id', valuationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async deleteValuation(valuationId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('asset_valuations')
      .delete()
      .eq('household_id', householdId)
      .eq('id', valuationId);

    if (error) {
      throw error;
    }
  }

  private requireHouseholdId(): string {
    const householdId = this.households.currentHousehold()?.id;
    if (!householdId) {
      throw new Error('No active household selected.');
    }
    return householdId;
  }

  private requireUserId(): string {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('You must be signed in.');
    }
    return userId;
  }
}
