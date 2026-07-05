import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { HouseholdService } from '../household/household.service';
import { SupabaseService } from '../supabase.service';

export interface ExchangeRate {
  id: string;
  household_id: string;
  currency: string;
  rate_to_pln: number;
  rate_date: string;
  source: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface CommodityPrice {
  id: string;
  household_id: string;
  commodity: string;
  price: number;
  currency: string;
  price_date: string;
  source: string | null;
  note: string | null;
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
export class RatesService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);

  private readonly exchangeRatesSignal = signal<ExchangeRate[]>([]);
  private readonly commodityPricesSignal = signal<CommodityPrice[]>([]);

  readonly exchangeRates = this.exchangeRatesSignal.asReadonly();
  readonly commodityPrices = this.commodityPricesSignal.asReadonly();

  readonly latestRateByCurrency = computed(() => {
    const latest = new Map<string, ExchangeRate>();
    for (const rate of this.exchangeRatesSignal()) {
      const current = latest.get(rate.currency);
      if (!current || rate.rate_date > current.rate_date) {
        latest.set(rate.currency, rate);
      }
    }
    return latest;
  });

  async loadExchangeRates(): Promise<ExchangeRate[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('exchange_rates')
      .select('*')
      .eq('household_id', householdId)
      .order('currency', { ascending: true })
      .order('rate_date', { ascending: false });

    if (error) {
      throw error;
    }

    this.exchangeRatesSignal.set(data ?? []);
    return this.exchangeRatesSignal();
  }

  async loadExchangeRate(rateId: string): Promise<ExchangeRate> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('exchange_rates')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', rateId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async createExchangeRate(input: {
    currency: string;
    rateToPln: number;
    rateDate: Date;
    source?: string;
    note?: string;
  }): Promise<ExchangeRate> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('exchange_rates')
      .insert({
        household_id: householdId,
        currency: input.currency,
        rate_to_pln: input.rateToPln,
        rate_date: toDateOnly(input.rateDate),
        source: input.source || null,
        note: input.note || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.exchangeRatesSignal.update((rates) => [data, ...rates]);
    return data;
  }

  async updateExchangeRate(
    rateId: string,
    input: { currency: string; rateToPln: number; rateDate: Date; source?: string; note?: string },
  ): Promise<ExchangeRate> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('exchange_rates')
      .update({
        currency: input.currency,
        rate_to_pln: input.rateToPln,
        rate_date: toDateOnly(input.rateDate),
        source: input.source || null,
        note: input.note || null,
      })
      .eq('household_id', householdId)
      .eq('id', rateId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.exchangeRatesSignal.update((rates) => rates.map((r) => (r.id === rateId ? data : r)));
    return data;
  }

  async deleteExchangeRate(rateId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('exchange_rates')
      .delete()
      .eq('household_id', householdId)
      .eq('id', rateId);

    if (error) {
      throw error;
    }

    this.exchangeRatesSignal.update((rates) => rates.filter((r) => r.id !== rateId));
  }

  async loadCommodityPrices(): Promise<CommodityPrice[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('commodity_prices')
      .select('*')
      .eq('household_id', householdId)
      .order('commodity', { ascending: true })
      .order('price_date', { ascending: false });

    if (error) {
      throw error;
    }

    this.commodityPricesSignal.set(data ?? []);
    return this.commodityPricesSignal();
  }

  async loadCommodityPrice(priceId: string): Promise<CommodityPrice> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('commodity_prices')
      .select('*')
      .eq('household_id', householdId)
      .eq('id', priceId)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  async createCommodityPrice(input: {
    commodity: string;
    price: number;
    currency: string;
    priceDate: Date;
    source?: string;
    note?: string;
  }): Promise<CommodityPrice> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('commodity_prices')
      .insert({
        household_id: householdId,
        commodity: input.commodity,
        price: input.price,
        currency: input.currency,
        price_date: toDateOnly(input.priceDate),
        source: input.source || null,
        note: input.note || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.commodityPricesSignal.update((prices) => [data, ...prices]);
    return data;
  }

  async updateCommodityPrice(
    priceId: string,
    input: {
      commodity: string;
      price: number;
      currency: string;
      priceDate: Date;
      source?: string;
      note?: string;
    },
  ): Promise<CommodityPrice> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('commodity_prices')
      .update({
        commodity: input.commodity,
        price: input.price,
        currency: input.currency,
        price_date: toDateOnly(input.priceDate),
        source: input.source || null,
        note: input.note || null,
      })
      .eq('household_id', householdId)
      .eq('id', priceId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.commodityPricesSignal.update((prices) =>
      prices.map((p) => (p.id === priceId ? data : p)),
    );
    return data;
  }

  async deleteCommodityPrice(priceId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('commodity_prices')
      .delete()
      .eq('household_id', householdId)
      .eq('id', priceId);

    if (error) {
      throw error;
    }

    this.commodityPricesSignal.update((prices) => prices.filter((p) => p.id !== priceId));
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
