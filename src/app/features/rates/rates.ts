import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { HouseholdService } from '../../core/household/household.service';
import { FrankfurterService } from '../../core/rates/frankfurter.service';
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
    TranslocoModule,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold">{{ 'rates.title' | transloco }}</h1>
        <p class="text-muted-foreground text-sm">
          {{ 'rates.subtitle' | transloco }}
        </p>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ 'rates.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard class="max-w-md">
        <div hlmCardHeader>
          <h2 hlmCardTitle>{{ 'rates.baseCurrency' | transloco }}</h2>
          <p hlmCardDescription>
            {{ 'rates.baseCurrencyDescription' | transloco }}
          </p>
        </div>
        <div hlmCardContent>
          @if (isOwner()) {
            <div class="flex items-end gap-2">
              <div hlmField class="w-32">
                <label hlmFieldLabel for="baseCurrency">{{ 'rates.baseCurrency' | transloco }}</label>
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
                {{ 'common.save' | transloco }}
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
            <h2 hlmCardTitle>{{ 'rates.exchangeRatesTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'rates.exchangeRatesDescription' | transloco }}</p>
          </div>
          @if (canEdit()) {
            <div class="flex flex-wrap gap-2">
              @if (trackedCurrencies().length > 0) {
                <button
                  hlmBtn
                  variant="outline"
                  size="sm"
                  type="button"
                  [disabled]="syncingRates()"
                  (click)="syncRatesFromFrankfurter()"
                >
                  @if (syncingRates()) {
                    <hlm-spinner />
                  }
                  {{ 'rates.syncFromFrankfurter' | transloco }}
                </button>
              }
              <a hlmBtn variant="outline" size="sm" routerLink="/rates/exchange-rates/new">
                {{ 'rates.newRate' | transloco }}
              </a>
            </div>
          }
        </div>
        <div hlmCardContent>
          @if (syncError()) {
            <div hlmAlert variant="destructive" class="mb-4">
              <p hlmAlertTitle>{{ 'rates.syncErrorTitle' | transloco }}</p>
              <p hlmAlertDescription>{{ syncError() }}</p>
            </div>
          }
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'rates.loadingExchangeRates' | transloco }}
            </div>
          } @else if (exchangeRates().length === 0) {
            <p class="text-muted-foreground text-sm">{{ 'rates.noExchangeRates' | transloco }}</p>
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
                        {{ 'common.edit' | transloco }}
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
                        {{ 'common.delete' | transloco }}
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
            <h2 hlmCardTitle>{{ 'rates.commodityPricesTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'rates.commodityPricesDescription' | transloco }}</p>
          </div>
          @if (canEdit()) {
            <a hlmBtn variant="outline" size="sm" routerLink="/rates/commodity-prices/new">
              {{ 'rates.newPrice' | transloco }}
            </a>
          }
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'rates.loadingCommodityPrices' | transloco }}
            </div>
          } @else if (commodityPrices().length === 0) {
            <p class="text-muted-foreground text-sm">{{ 'rates.noCommodityPrices' | transloco }}</p>
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
                        {{ 'common.edit' | transloco }}
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
                        {{ 'common.delete' | transloco }}
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
  private readonly frankfurter = inject(FrankfurterService);
  private readonly households = inject(HouseholdService);
  private readonly transloco = inject(TranslocoService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savingBaseCurrency = signal(false);
  protected readonly deletingRateId = signal<string | null>(null);
  protected readonly deletingPriceId = signal<string | null>(null);
  protected readonly syncingRates = signal(false);
  protected readonly syncError = signal<string | null>(null);
  protected readonly baseCurrencyInput = signal('PLN');

  protected readonly exchangeRates = this.rates.exchangeRates;
  protected readonly commodityPrices = this.rates.commodityPrices;
  protected readonly trackedCurrencies = computed(() => [
    ...new Set(this.exchangeRates().map((rate) => rate.currency)),
  ]);
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

  protected async syncRatesFromFrankfurter(): Promise<void> {
    if (this.syncingRates()) {
      return;
    }

    this.syncingRates.set(true);
    this.syncError.set(null);

    const currencies = this.trackedCurrencies();
    const failures: string[] = [];

    for (const currency of currencies) {
      try {
        const rateToPln = await this.frankfurter.fetchRateToPln(currency, new Date());
        await this.rates.createExchangeRate({
          currency,
          rateToPln,
          rateDate: new Date(),
          source: 'frankfurter.dev',
        });
      } catch {
        failures.push(currency);
      }
    }

    if (failures.length > 0) {
      this.syncError.set(
        this.transloco.translate('rates.syncFailure', { currencies: failures.join(', ') }),
      );
    }

    this.syncingRates.set(false);
  }

  protected async deleteExchangeRate(rate: ExchangeRate): Promise<void> {
    const confirmed = window.confirm(
      this.transloco.translate('rates.deleteExchangeRateConfirm', {
        currency: rate.currency,
        date: rate.rate_date,
      }),
    );
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
    const confirmed = window.confirm(
      this.transloco.translate('rates.deleteCommodityPriceConfirm', {
        commodity: price.commodity,
        date: price.price_date,
      }),
    );
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
