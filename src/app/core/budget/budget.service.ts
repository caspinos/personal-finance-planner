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
  name: string;
  amortized_months: number | null;
  amortized_start_on: string | null;
  created_by: string;
  created_at: string;
}

export interface TransactionNameSuggestion {
  name: string;
  envelope_id: string;
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
  name: string;
  transaction_type: BudgetTransactionType;
  envelope_id: string;
  amortized_months: number | null;
}

/**
 * A single derived monthly slice of an amortized expense. Not a stored record:
 * it is computed from the source transaction's amortization parameters, and it
 * (not the payment) is what consumes the envelope's budget for its month.
 */
export interface EnvelopeAmortizedChargeEvent {
  kind: 'amortized_charge';
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  name: string;
  envelope_id: string;
  source_transaction_id: string;
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

export type EnvelopeEvent =
  EnvelopeTransactionEvent | EnvelopeTransferEvent | EnvelopeAmortizedChargeEvent;

export interface AmortizedCharge {
  transaction_id: string;
  envelope_id: string;
  name: string;
  month: string;
  amount: number;
}

export interface GlobalTransactionEvent {
  kind: 'transaction';
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  name: string;
  transaction_type: BudgetTransactionType;
  envelope_id: string;
  envelope_name: string;
  amortized_months: number | null;
}

export interface GlobalTransferEvent {
  kind: 'transfer';
  id: string;
  occurred_on: string;
  amount: number;
  currency: string;
  description: string | null;
  from_envelope_id: string;
  to_envelope_id: string;
  from_envelope_name: string;
  to_envelope_name: string;
}

export type GlobalEvent = GlobalTransactionEvent | GlobalTransferEvent;

export interface RecurringEnvelopeRule {
  id: string;
  household_id: string;
  envelope_id: string;
  type: BudgetTransactionType;
  amount: number;
  name: string;
  day_of_month: number;
  active: boolean;
  next_run_on: string;
  last_run_on: string | null;
  created_by: string;
  created_at: string;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Normalizes amortization input into the two columns stored on a transaction.
 * Amortization is expense-only, so an income transaction always clears it. The
 * schedule starts at the first day of the payment's month, so editing the
 * transaction date shifts the whole schedule (invariant #3: header edits always
 * re-derive the slices, which are computed downstream, never stored).
 */
function resolveAmortization(
  type: BudgetTransactionType,
  amortizedMonths: number | null | undefined,
  occurredOn: Date,
): { months: number | null; startOn: string | null } {
  if (type !== 'expense' || !amortizedMonths || amortizedMonths < 2) {
    return { months: null, startOn: null };
  }

  const startOfMonth = new Date(occurredOn.getFullYear(), occurredOn.getMonth(), 1);
  return { months: amortizedMonths, startOn: toDateOnly(startOfMonth) };
}

function nextOccurrence(dayOfMonth: number, from: Date): Date {
  const candidate = new Date(from.getFullYear(), from.getMonth(), dayOfMonth);
  if (candidate < new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
    return new Date(from.getFullYear(), from.getMonth() + 1, dayOfMonth);
  }
  return candidate;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  private readonly envelopesSignal = signal<Envelope[]>([]);
  private readonly balancesSignal = signal<Record<string, EnvelopeBalance>>({});
  private readonly recurringRulesSignal = signal<RecurringEnvelopeRule[]>([]);

  readonly envelopes = this.envelopesSignal.asReadonly();
  readonly activeEnvelopes = computed(() => this.envelopesSignal().filter((e) => !e.archived));
  readonly balances = this.balancesSignal.asReadonly();
  readonly recurringRules = this.recurringRulesSignal.asReadonly();

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

    const chargesQuery = this.supabase.rpc('get_amortized_charges', {
      p_household_id: householdId,
      p_from: from,
      p_to: to,
    });

    const [
      { data: transactions, error: transactionsError },
      { data: transfers, error: transfersError },
      { data: charges, error: chargesError },
    ] = await Promise.all([transactionQuery, transferQuery, chargesQuery]);

    if (transactionsError) {
      throw transactionsError;
    }

    if (transfersError) {
      throw transfersError;
    }

    if (chargesError) {
      throw chargesError;
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
        name: transaction.name,
        transaction_type: transaction.type,
        envelope_id: transaction.envelope_id,
        amortized_months: transaction.amortized_months ?? null,
      })),
      ...((charges ?? []) as AmortizedCharge[])
        .filter((charge) => charge.envelope_id === input.envelopeId)
        .map<EnvelopeEvent>((charge) => ({
          kind: 'amortized_charge',
          id: `${charge.transaction_id}:${charge.month}`,
          occurred_on: charge.month,
          amount: Number(charge.amount),
          currency: 'PLN',
          name: charge.name,
          envelope_id: charge.envelope_id,
          source_transaction_id: charge.transaction_id,
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

  async loadAllEvents(input: { from: Date; to: Date }): Promise<GlobalEvent[]> {
    const householdId = this.requireHouseholdId();
    const from = toDateOnly(input.from);
    const to = toDateOnly(input.to);

    const transactionQuery = this.supabase
      .from('budget_transactions')
      .select('*')
      .eq('household_id', householdId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });

    const transferQuery = this.supabase
      .from('envelope_transfers')
      .select('*')
      .eq('household_id', householdId)
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
    const envelopeName = (id: string) => envelopeNames.get(id) ?? 'Unknown envelope';

    return [
      ...(transactions ?? []).map<GlobalEvent>((transaction) => ({
        kind: 'transaction',
        id: transaction.id,
        occurred_on: transaction.occurred_on,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        name: transaction.name,
        transaction_type: transaction.type,
        envelope_id: transaction.envelope_id,
        envelope_name: envelopeName(transaction.envelope_id),
        amortized_months: transaction.amortized_months ?? null,
      })),
      ...(transfers ?? []).map<GlobalEvent>((transfer) => ({
        kind: 'transfer',
        id: transfer.id,
        occurred_on: transfer.occurred_on,
        amount: Number(transfer.amount),
        currency: 'PLN',
        description: transfer.description,
        from_envelope_id: transfer.from_envelope_id,
        to_envelope_id: transfer.to_envelope_id,
        from_envelope_name: envelopeName(transfer.from_envelope_id),
        to_envelope_name: envelopeName(transfer.to_envelope_id),
      })),
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

  async updateEnvelope(envelopeId: string, name: string): Promise<Envelope> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('envelopes')
      .update({ name })
      .eq('household_id', householdId)
      .eq('id', envelopeId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.envelopesSignal.update((envelopes) =>
      envelopes.map((envelope) => (envelope.id === envelopeId ? data : envelope)),
    );
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
    name: string;
    amortizedMonths?: number | null;
  }): Promise<BudgetTransaction> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const amortization = resolveAmortization(input.type, input.amortizedMonths, input.occurredOn);

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .insert({
        household_id: householdId,
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        name: input.name,
        amortized_months: amortization.months,
        amortized_start_on: amortization.startOn,
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
      name: string;
      amortizedMonths?: number | null;
    },
  ): Promise<BudgetTransaction> {
    const householdId = this.requireHouseholdId();

    const amortization = resolveAmortization(input.type, input.amortizedMonths, input.occurredOn);

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .update({
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        occurred_on: toDateOnly(input.occurredOn),
        name: input.name,
        amortized_months: amortization.months,
        amortized_start_on: amortization.startOn,
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

  async loadTransactionNameSuggestions(): Promise<TransactionNameSuggestion[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('budget_transactions')
      .select('name, envelope_id')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    const seen = new Set<string>();
    const suggestions: TransactionNameSuggestion[] = [];
    for (const row of data ?? []) {
      if (seen.has(row.name)) {
        continue;
      }
      seen.add(row.name);
      suggestions.push({ name: row.name, envelope_id: row.envelope_id });
    }

    return suggestions;
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

  async processDueRecurringRules(): Promise<number> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase.rpc('process_due_recurring_rules', {
      p_household_id: householdId,
    });

    if (error) {
      throw error;
    }

    return Number(data ?? 0);
  }

  async loadRecurringRules(): Promise<RecurringEnvelopeRule[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('recurring_envelope_rules')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    this.recurringRulesSignal.set(data ?? []);
    return this.recurringRulesSignal();
  }

  async loadRecurringRule(ruleId: string): Promise<RecurringEnvelopeRule> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('recurring_envelope_rules')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', ruleId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async createRecurringRule(input: {
    envelopeId: string;
    type: BudgetTransactionType;
    amount: number;
    name: string;
    dayOfMonth: number;
  }): Promise<RecurringEnvelopeRule> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('recurring_envelope_rules')
      .insert({
        household_id: householdId,
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        name: input.name,
        day_of_month: input.dayOfMonth,
        next_run_on: toDateOnly(nextOccurrence(input.dayOfMonth, new Date())),
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.recurringRulesSignal.update((rules) => [...rules, data]);
    return data;
  }

  async updateRecurringRule(
    ruleId: string,
    input: {
      envelopeId: string;
      type: BudgetTransactionType;
      amount: number;
      name: string;
      dayOfMonth: number;
    },
  ): Promise<RecurringEnvelopeRule> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('recurring_envelope_rules')
      .update({
        envelope_id: input.envelopeId,
        type: input.type,
        amount: input.amount,
        name: input.name,
        day_of_month: input.dayOfMonth,
        next_run_on: toDateOnly(nextOccurrence(input.dayOfMonth, new Date())),
      })
      .eq('household_id', householdId)
      .eq('id', ruleId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.recurringRulesSignal.update((rules) => rules.map((r) => (r.id === ruleId ? data : r)));
    return data;
  }

  async setRecurringRuleActive(ruleId: string, active: boolean): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('recurring_envelope_rules')
      .update({ active })
      .eq('household_id', householdId)
      .eq('id', ruleId);

    if (error) {
      throw error;
    }

    this.recurringRulesSignal.update((rules) =>
      rules.map((rule) => (rule.id === ruleId ? { ...rule, active } : rule)),
    );
  }

  async deleteRecurringRule(ruleId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('recurring_envelope_rules')
      .delete()
      .eq('household_id', householdId)
      .eq('id', ruleId);

    if (error) {
      throw error;
    }

    this.recurringRulesSignal.update((rules) => rules.filter((r) => r.id !== ruleId));
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
