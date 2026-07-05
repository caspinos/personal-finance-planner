import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

function toDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(date: Date): boolean {
  return toDateOnly(date) === toDateOnly(new Date());
}

/**
 * Client for the free frankfurter.dev exchange rate API (ECB reference
 * rates). Used to auto-fill exchange_rates rows instead of manual entry.
 */
@Injectable({ providedIn: 'root' })
export class FrankfurterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'https://api.frankfurter.dev/v1';

  /** Rate for 1 unit of `currency` expressed in PLN, as of `date` (or the latest ECB publish on/before it). */
  async fetchRateToPln(currency: string, date: Date): Promise<number> {
    const path = isToday(date) ? 'latest' : toDateOnly(date);
    const response = await firstValueFrom(
      this.http.get<FrankfurterResponse>(`${this.baseUrl}/${path}`, {
        params: { base: currency, symbols: 'PLN' },
      }),
    );

    const rate = response.rates['PLN'];
    if (rate === undefined) {
      throw new Error(`frankfurter.dev has no PLN rate for ${currency}.`);
    }

    return rate;
  }
}
