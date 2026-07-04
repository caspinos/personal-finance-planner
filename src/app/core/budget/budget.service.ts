import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { HouseholdService } from '../household/household.service';
import { SupabaseService } from '../supabase.service';

export interface Envelope {
  id: string;
  household_id: string;
  name: string;
  archived: boolean;
  created_by: string;
  created_at: string;
}

export type BudgetTransactionType = 'expense' | 'income';

export interface BudgetTransaction {
  id: string;
  household_id: string;
  envelope_id: string;
  type: BudgetTransactionType;
  amount: number;
  currency: string;
  occurred_on: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface EnvelopeTransfer {
  id: string;
  household_id: string;
  from_envelope_id: string;
  to_envelope_id: string;
  amount: number;
  occurred_on: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  private readonly envelopesSignal = signal<Envelope[]>([]);
  private readonly balancesSignal = signal<Record<string, number>>({});

  readonly envelopes = this.envelopesSignal.asReadonly();
  readonly activeEnvelopes = computed(() => this.envelopesSignal().filter((e) => !e.archived));
  readonly balances = this.balancesSignal.asReadonly();

  async loadEnvelopes(): Promise<Envelope[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('envelopes')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    this.envelopesSignal.set(data ?? []);
    return this.envelopesSignal();
  }

  async loadBalances(asOf: Date): Promise<Record<string, number>> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase.rpc('get_envelope_balances', {
      p_household_id: householdId,
      p_as_of: toDateOnly(asOf),
    });

    if (error) {
      throw error;
    }

    const balances: Record<string, number> = {};
    for (const row of data ?? []) {
      balances[row.envelope_id] = Number(row.balance);
    }

    this.balancesSignal.set(balances);
    return balances;
  }

  async createEnvelope(name: string): Promise<Envelope> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('envelopes')
      .insert({ household_id: householdId, name, created_by: userId })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.envelopesSignal.update((envelopes) => [...envelopes, data]);
    return data;
  }

  async setEnvelopeArchived(envelopeId: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('envelopes')
      .update({ archived })
      .eq('id', envelopeId);

    if (error) {
      throw error;
    }

    this.envelopesSignal.update((envelopes) =>
      envelopes.map((envelope) =>
        envelope.id === envelopeId ? { ...envelope, archived } : envelope
      )
    );
  }

  async recordTransaction(input: {
    envelopeId: string;
    type: BudgetTransactionType;
    amount: number;
    occurredOn: Date;
    description?: string;
  }): Promise<BudgetTransaction> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .insert({
        household_id: householdId,
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        description: input.description || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async transfer(input: {
    fromEnvelopeId: string;
    toEnvelopeId: string;
    amount: number;
    occurredOn: Date;
    description?: string;
  }): Promise<EnvelopeTransfer> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('envelope_transfers')
      .insert({
        household_id: householdId,
        from_envelope_id: input.fromEnvelopeId,
        to_envelope_id: input.toEnvelopeId,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        description: input.description || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
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
