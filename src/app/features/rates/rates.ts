import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { HouseholdService } from '../../core/household/household.service';
import { CommodityPrice, ExchangeRate, RatesService } from '../../core/rates/rates.service';

@Component({
  selector: 'app-rates',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold">Rates</h1>
        <p class="text-muted-foreground text-sm">
          Manage the household's base currency and manual exchange rate / commodity price
          history.
        </p>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load rates</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard class="max-w-md">
        <div hlmCardHeader>
          <h2 hlmCardTitle>Base currency</h2>
          <p hlmCardDescription>
            Net worth and budget totals are converted into this currency where a rate is
            available.
          </p>
        </div>
        <div hlmCardContent>
          @if (isOwner()) {
            <div class="flex items-end gap-2">
              <div hlmField class="w-32">
                <label hlmFieldLabel for="baseCurrency">Base currency</label>
                <input
                  hlmInput
                  id="baseCurrency"
                  type="text"
                  maxlength="3"
                  [value]="baseCurrencyInput()"
                  (input)="onBaseCurrencyInput($event)"
                />
              </div>
              <button
                hlmBtn
                size="sm"
                type="button"
                [disabled]="savingBaseCurrency()"
                (click)="saveBaseCurrency()"
              >
                @if (savingBaseCurrency()) {
                  <hlm-spinner />
                }
                Save
              </button>
            </div>
          } @else {
            <p class="text-lg font-medium">{{ baseCurrency() }}</p>
          }
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader class="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <h2 hlmCardTitle>Exchange rates</h2>
            <p hlmCardDescription>1 unit of a currency, expressed in PLN, as of a date.</p>
          </div>
          @if (canEdit()) {
            <a hlmBtn variant="outline" size="sm" routerLink="/rates/exchange-rates/new">
              New rate
            </a>
          }
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading exchange rates...
            </div>
          } @else if (exchangeRates().length === 0) {
            <p class="text-muted-foreground text-sm">No exchange rates yet.</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (rate of exchangeRates(); track rate.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">{{ rate.currency }}</span>
                      <span class="text-muted-foreground text-sm">
                        {{ rate.rate_to_pln | number: '1.2-6' }} PLN
                      </span>
                      <span class="text-muted-foreground text-sm">
                        {{ rate.rate_date | date: 'mediumDate' }}
                      </span>
                    </div>
                    @if (rate.source) {
                      <p class="text-muted-foreground truncate text-sm">{{ rate.source }}</p>
                    }
                  </div>

                  @if (canEdit()) {
                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                      <a
                        hlmBtn
                        variant="outline"
                        size="sm"
                        [routerLink]="['/rates/exchange-rates', rate.id, 'edit']"
                      >
                        Edit
                      </a>
                      <button
                        hlmBtn
                        variant="destructive"
                        size="sm"
                        type="button"
                        [disabled]="deletingRateId() === rate.id"
                        (click)="deleteExchangeRate(rate)"
                      >
                        @if (deletingRateId() === rate.id) {
                          <hlm-spinner />
                        }
                        Delete
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader class="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <h2 hlmCardTitle>Commodity prices</h2>
            <p hlmCardDescription>Manual price log for reference (e.g. gold).</p>
          </div>
          @if (canEdit()) {
            <a hlmBtn variant="outline" size="sm" routerLink="/rates/commodity-prices/new">
              New price
            </a>
          }
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading commodity prices...
            </div>
          } @else if (commodityPrices().length === 0) {
            <p class="text-muted-foreground text-sm">No commodity prices yet.</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (price of commodityPrices(); track price.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">{{ price.commodity }}</span>
                      <span class="text-muted-foreground text-sm">
                        {{ price.price | number: '1.2-4' }} {{ price.currency }}
                      </span>
                      <span class="text-muted-foreground text-sm">
                        {{ price.price_date | date: 'mediumDate' }}
                      </span>
                    </div>
                    @if (price.source) {
                      <p class="text-muted-foreground truncate text-sm">{{ price.source }}</p>
                    }
                  </div>

                  @if (canEdit()) {
                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                      <a
                        hlmBtn
                        variant="outline"
                        size="sm"
                        [routerLink]="['/rates/commodity-prices', price.id, 'edit']"
                      >
                        Edit
                      </a>
                      <button
                        hlmBtn
                        variant="destructive"
                        size="sm"
                        type="button"
                        [disabled]="deletingPriceId() === price.id"
                        (click)="deleteCommodityPrice(price)"
                      >
                        @if (deletingPriceId() === price.id) {
                          <hlm-spinner />
                        }
                        Delete
                      </button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </div>
  `,
})
export class Rates {
  protected readonly rates = inject(RatesService);
  private readonly households = inject(HouseholdService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savingBaseCurrency = signal(false);
  protected readonly deletingRateId = signal<string | null>(null);
  protected readonly deletingPriceId = signal<string | null>(null);
  protected readonly baseCurrencyInput = signal('PLN');

  protected readonly exchangeRates = this.rates.exchangeRates;
  protected readonly commodityPrices = this.rates.commodityPrices;
  protected readonly baseCurrency = computed(
    () => this.households.currentHousehold()?.base_currency ?? 'PLN',
  );
  protected readonly isOwner = computed(() => this.households.currentRole() === 'owner');
  protected readonly canEdit = computed(() => {
    const role = this.households.currentRole();
    return role === 'owner' || role === 'editor';
  });

  constructor() {
    void this.loadAll();
  }

  protected onBaseCurrencyInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.baseCurrencyInput.set(value.toUpperCase());
  }

  protected async saveBaseCurrency(): Promise<void> {
    const currency = this.baseCurrencyInput().trim();
    if (currency.length !== 3 || this.savingBaseCurrency()) {
      return;
    }

    this.savingBaseCurrency.set(true);
    this.errorMessage.set(null);

    try {
      await this.households.updateBaseCurrency(currency);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.savingBaseCurrency.set(false);
    }
  }

  protected async deleteExchangeRate(rate: ExchangeRate): Promise<void> {
    const confirmed = window.confirm(`Delete the ${rate.currency} rate for ${rate.rate_date}?`);
    if (!confirmed) {
      return;
    }

    this.deletingRateId.set(rate.id);
    this.errorMessage.set(null);

    try {
      await this.rates.deleteExchangeRate(rate.id);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.deletingRateId.set(null);
    }
  }

  protected async deleteCommodityPrice(price: CommodityPrice): Promise<void> {
    const confirmed = window.confirm(`Delete the ${price.commodity} price for ${price.price_date}?`);
    if (!confirmed) {
      return;
    }

    this.deletingPriceId.set(price.id);
    this.errorMessage.set(null);

    try {
      await this.rates.deleteCommodityPrice(price.id);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.deletingPriceId.set(null);
    }
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.baseCurrencyInput.set(this.baseCurrency());

    try {
      await Promise.all([
        this.rates.loadExchangeRates(),
        this.rates.loadCommodityPrices(),
        this.households.loadMembers(),
      ]);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }

    return 'Something went wrong.';
  }
}
