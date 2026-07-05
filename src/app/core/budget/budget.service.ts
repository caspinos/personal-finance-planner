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

export interface EnvelopeBalance {
  balance: number;
  balance_in_base: number | null;
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

export interface EnvelopeTransactionEvent {
  kind: 'transaction';
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  description: string | null;
  transaction_type: BudgetTransactionType;
  envelope_id: string;
}

export interface EnvelopeTransferEvent {
  kind: 'transfer';
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  description: string | null;
  direction: 'in' | 'out';
  from_envelope_id: string;
  to_envelope_id: string;
  other_envelope_name: string;
}

export type EnvelopeEvent = EnvelopeTransactionEvent | EnvelopeTransferEvent;

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
  private readonly balancesSignal = signal<Record<string, EnvelopeBalance>>({});

  readonly envelopes = this.envelopesSignal.asReadonly();
  readonly activeEnvelopes = computed(() => this.envelopesSignal().filter((e) => !e.archived));
  readonly balances = this.balancesSignal.asReadonly();

  async loadEnvelope(envelopeId: string): Promise<Envelope> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('envelopes')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', envelopeId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

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

  async loadBalances(asOf: Date): Promise<Record<string, EnvelopeBalance>> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase.rpc('get_envelope_balances', {
      p_household_id: householdId,
      p_as_of: toDateOnly(asOf),
    });

    if (error) {
      throw error;
    }

    const balances: Record<string, EnvelopeBalance> = {};
    for (const row of data ?? []) {
      balances[row.envelope_id] = {
        balance: Number(row.balance),
        balance_in_base: row.balance_in_base === null ? null : Number(row.balance_in_base),
      };
    }

    this.balancesSignal.set(balances);
    return balances;
  }

  async loadEnvelopeEvents(input: {
    envelopeId: string;
    from: Date;
    to: Date;
  }): Promise<EnvelopeEvent[]> {
    const householdId = this.requireHouseholdId();
    const from = toDateOnly(input.from);
    const to = toDateOnly(input.to);

    const transactionQuery = this.supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', householdId)
      .eq('envelope_id', input.envelopeId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    const transferQuery = this.supabase
      .from('envelope_transfers')
      .select('*')
      .eq('household_id', householdId)
      .or(`from_envelope_id.eq.${input.envelopeId},to_envelope_id.eq.${input.envelopeId}`)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    const [
      { data: transactions, error: transactionsError },
      { data: transfers, error: transfersError },
    ] = await Promise.all([transactionQuery, transferQuery]);

    if (transactionsError) {
      throw transactionsError;
    }

    if (transfersError) {
      throw transfersError;
    }

    const envelopes = await this.ensureEnvelopesLoaded();
    const envelopeNames = new Map(envelopes.map((envelope) => [envelope.id, envelope.name]));

    return [
      ...(transactions ?? []).map<EnvelopeEvent>((transaction) => ({
        kind: 'transaction',
        id: transaction.id,
        occurred_on: transaction.occurred_on,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        description: transaction.description,
        transaction_type: transaction.type,
        envelope_id: transaction.envelope_id,
      })),
      ...(transfers ?? []).map<EnvelopeEvent>((transfer) => {
        const direction = transfer.to_envelope_id === input.envelopeId ? 'in' : 'out';
        const otherEnvelopeId =
          direction === 'in' ? transfer.from_envelope_id : transfer.to_envelope_id;

        return {
          kind: 'transfer',
          id: transfer.id,
          occurred_on: transfer.occurred_on,
          amount: Number(transfer.amount),
          currency: 'PLN',
          description: transfer.description,
          direction,
          from_envelope_id: transfer.from_envelope_id,
          to_envelope_id: transfer.to_envelope_id,
          other_envelope_name: envelopeNames.get(otherEnvelopeId) ?? 'Unknown envelope',
        };
      }),
    ].sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
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
        envelope.id === envelopeId ? { ...envelope, archived } : envelope,
      ),
    );
  }

  async loadTransaction(transactionId: string): Promise<BudgetTransaction> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', transactionId)
      .single();

    if (error) {
      throw error;
    }

    return data;
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

  async updateTransaction(
    transactionId: string,
    input: {
      envelopeId: string;
      type: BudgetTransactionType;
      amount: number;
      occurredOn: Date;
      description?: string;
    },
  ): Promise<BudgetTransaction> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .update({
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        description: input.description || null,
      })
      .eq('household_id', householdId)
      .eq('id', transactionId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('budget_transactions')
      .delete()
      .eq('household_id', householdId)
      .eq('id', transactionId);

    if (error) {
      throw error;
    }
  }

  async loadTransfer(transferId: string): Promise<EnvelopeTransfer> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('envelope_transfers')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', transferId)
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

  async updateTransfer(
    transferId: string,
    input: {
      fromEnvelopeId: string;
      toEnvelopeId: string;
      amount: number;
      occurredOn: Date;
      description?: string;
    },
  ): Promise<EnvelopeTransfer> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('envelope_transfers')
      .update({
        from_envelope_id: input.fromEnvelopeId,
        to_envelope_id: input.toEnvelopeId,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        description: input.description || null,
      })
      .eq('household_id', householdId)
      .eq('id', transferId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async deleteTransfer(transferId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('envelope_transfers')
      .delete()
      .eq('household_id', householdId)
      .eq('id', transferId);

    if (error) {
      throw error;
    }
  }

  private async ensureEnvelopesLoaded(): Promise<Envelope[]> {
    if (this.envelopesSignal().length === 0) {
      return await this.loadEnvelopes();
    }

    return this.envelopesSignal();
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
