import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { HouseholdService } from '../../core/household/household.service';
import { LanguageService } from '../../core/i18n/language.service';
import {
  AssetLiquidityClass,
  NetWorthService,
  NetWorthSummaryRow,
} from '../../core/net-worth/net-worth.service';

const LIQUIDITY_CLASSES: Array<{ value: AssetLiquidityClass; labelKey: string }> = [
  { value: 'cash', labelKey: 'netWorth.liquidity.cash' },
  { value: 'liquid', labelKey: 'netWorth.liquidity.liquid' },
  { value: 'restricted', labelKey: 'netWorth.liquidity.restricted' },
  { value: 'illiquid', labelKey: 'netWorth.liquidity.illiquid' },
  { value: 'liability', labelKey: 'netWorth.liquidity.liability' },
];

@Component({
  selector: 'app-net-worth',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmSelectImports,
    HlmSpinnerImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">{{ 'netWorth.title' | transloco }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ 'netWorth.subtitle' | transloco: { date: asOfLabel() } }}
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <a hlmBtn variant="outline" size="sm" routerLink="/net-worth/valuations/new">
            {{ 'netWorth.addValuation' | transloco }}
          </a>
          <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">{{
            'netWorth.newAccount' | transloco
          }}</a>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ 'netWorth.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>{{ 'netWorth.totalNetWorth' | transloco }}</h2>
          <p hlmCardDescription>{{ 'netWorth.totalNetWorthDescription' | transloco }}</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'netWorth.loading' | transloco }}
            </div>
          } @else {
            <p
              class="text-3xl font-semibold"
              [class.text-destructive]="netWorth.totalNetWorth() < 0"
            >
              {{ netWorth.totalNetWorth() | number: '1.2-2' }} {{ baseCurrency() }}
            </p>
            @if (netWorth.hasUnconvertedRows()) {
              <p class="text-muted-foreground mt-1 text-xs">
                {{ 'netWorth.unconvertedNotice' | transloco }}
                <a routerLink="/rates" class="underline">{{ 'netWorth.addRate' | transloco }}</a>
              </p>
            }
          }
        </div>
      </div>

      @if (!loading() && rows().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'netWorth.noAccountsTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'netWorth.noAccountsDescription' | transloco }}</p>
          </div>
          <div hlmCardFooter>
            <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">{{
              'netWorth.createAccount' | transloco
            }}</a>
          </div>
        </div>
      } @else if (!loading()) {
        <div class="flex flex-wrap items-end gap-2">
          <div hlmField class="w-48">
            <label hlmFieldLabel>{{ 'netWorth.filterByLiquidity' | transloco }}</label>
            <hlm-select
              [value]="liquidityFilter()"
              (valueChange)="onLiquidityFilterChange($event)"
              [itemToString]="liquidityToString"
            >
              <hlm-select-trigger class="w-48">
                <hlm-select-value [placeholder]="'netWorth.allLiquidityClasses' | transloco" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (option of liquidityClasses; track option.value) {
                  <hlm-select-item [value]="option.value">{{
                    option.labelKey | transloco
                  }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </div>
          @if (liquidityFilter()) {
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="clearLiquidityFilter()">
              {{ 'netWorth.clearFilter' | transloco }}
            </button>
          }
        </div>

        @if (groupedRows().length === 0) {
          <p class="text-muted-foreground text-sm">{{ 'netWorth.noAccountsMatchFilter' | transloco }}</p>
        }

        @for (group of groupedRows(); track group.type) {
          <div class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold">{{ accountTypeLabel(group.type) }}</h2>
              <span
                class="font-medium"
                [class.text-destructive]="group.subtotal < 0"
              >
                {{ group.subtotal | number: '1.2-2' }} {{ baseCurrency() }}
              </span>
            </div>

            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              @for (row of group.rows; track row.account_id) {
                <div hlmCard>
                  <div hlmCardHeader>
                    <h3 hlmCardTitle>{{ row.account_name }}</h3>
                    <p hlmCardDescription>
                      {{ liquidityLabel(row.liquidity) }}
                      @if (row.category) {
                        &middot; {{ row.category }}
                      }
                    </p>
                  </div>
                  <div hlmCardContent class="flex flex-col gap-2">
                    <p
                      class="text-2xl font-semibold"
                      [class.text-destructive]="row.signed_value < 0"
                    >
                      {{ row.signed_value | number: '1.2-2' }} {{ row.currency }}
                    </p>
                    @if (row.currency !== baseCurrency()) {
                      @if (row.signed_value_in_base !== null) {
                        <p class="text-muted-foreground text-sm">
                          &approx; {{ row.signed_value_in_base | number: '1.2-2' }}
                          {{ baseCurrency() }}
                        </p>
                      } @else {
                        <p class="text-muted-foreground text-xs">
                          {{ 'netWorth.noExchangeRate' | transloco }}
                          <a routerLink="/rates" class="underline">{{
                            'netWorth.addOne' | transloco
                          }}</a>
                        </p>
                      }
                    }
                    <p class="text-muted-foreground text-sm">
                      @if (row.valued_on) {
                        {{ 'netWorth.valued' | transloco: { date: (row.valued_on | date: 'mediumDate') } }}
                      } @else {
                        {{ 'netWorth.noValuationYet' | transloco }}
                      }
                    </p>
                  </div>
                  <div hlmCardFooter class="flex flex-wrap gap-2">
                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      [routerLink]="['/net-worth/accounts', row.account_id]"
                    >
                      {{ 'netWorth.viewHistory' | transloco }}
                    </a>
                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      routerLink="/net-worth/valuations/new"
                      [queryParams]="{ accountId: row.account_id }"
                    >
                      {{ 'netWorth.addValuation' | transloco }}
                    </a>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class NetWorth {
  protected readonly netWorth = inject(NetWorthService);
  private readonly households = inject(HouseholdService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  protected readonly liquidityClasses = LIQUIDITY_CLASSES;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly asOf = signal(new Date());
  protected readonly liquidityFilter = signal<AssetLiquidityClass | undefined>(undefined);
  protected readonly rows = this.netWorth.summary;
  protected readonly baseCurrency = computed(
    () => this.households.currentHousehold()?.base_currency ?? 'PLN',
  );
  protected readonly asOfLabel = computed(() =>
    this.asOf().toLocaleDateString(this.language.localeTag(), {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  );
  protected readonly filteredRows = computed(() => {
    const filter = this.liquidityFilter();
    return filter ? this.rows().filter((row) => row.liquidity === filter) : this.rows();
  });
  protected readonly groupedRows = computed(() => {
    const groups = new Map<NetWorthSummaryRow['account_type'], NetWorthSummaryRow[]>();

    for (const row of this.filteredRows()) {
      const rowsForType = groups.get(row.account_type) ?? [];
      rowsForType.push(row);
      groups.set(row.account_type, rowsForType);
    }

    return Array.from(groups.entries()).map(([type, rows]) => ({
      type,
      rows,
      subtotal: rows.reduce((total, row) => total + (row.signed_value_in_base ?? row.signed_value), 0),
    }));
  });

  protected readonly liquidityToString = (value: AssetLiquidityClass): string =>
    this.liquidityLabel(value);

  constructor() {
    void this.loadAll();
  }

  protected accountTypeLabel(type: NetWorthSummaryRow['account_type']): string {
    return this.transloco.translate(`netWorth.accountType.${type}`);
  }

  protected liquidityLabel(liquidity: AssetLiquidityClass): string {
    const key = LIQUIDITY_CLASSES.find((option) => option.value === liquidity)?.labelKey;
    return key ? this.transloco.translate(key) : liquidity;
  }

  protected onLiquidityFilterChange(
    value: AssetLiquidityClass | AssetLiquidityClass[] | null | undefined,
  ): void {
    this.liquidityFilter.set(typeof value === 'string' ? value : undefined);
  }

  protected clearLiquidityFilter(): void {
    this.liquidityFilter.set(undefined);
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.loadAccounts();
      await this.netWorth.loadSummary(this.asOf());
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
