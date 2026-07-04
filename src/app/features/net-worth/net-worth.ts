import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import {
  AssetLiquidityClass,
  NetWorthService,
  NetWorthSummaryRow,
} from '../../core/net-worth/net-worth.service';

const LIQUIDITY_CLASSES: Array<{ value: AssetLiquidityClass; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'illiquid', label: 'Illiquid' },
  { value: 'liability', label: 'Liability' },
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
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold">Net worth</h1>
          <p class="text-muted-foreground text-sm">
            Manual account valuations as of {{ asOfLabel() }}.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <a hlmBtn variant="outline" size="sm" routerLink="/net-worth/valuations/new">
            Add valuation
          </a>
          <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">New account</a>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load net worth</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Total net worth</h2>
          <p hlmCardDescription>Liabilities are subtracted from the total.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading net worth...
            </div>
          } @else {
            <p
              class="text-3xl font-semibold"
              [class.text-destructive]="netWorth.totalNetWorth() < 0"
            >
              {{ netWorth.totalNetWorth() | number: '1.2-2' }}
            </p>
          }
        </div>
      </div>

      @if (!loading() && rows().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>No asset accounts yet</h2>
            <p hlmCardDescription>Create an account, then add a manual valuation snapshot.</p>
          </div>
          <div hlmCardFooter>
            <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">Create account</a>
          </div>
        </div>
      } @else if (!loading()) {
        <div class="flex flex-wrap items-end gap-2">
          <div hlmField class="w-48">
            <label hlmFieldLabel>Filter by liquidity</label>
            <hlm-select
              [value]="liquidityFilter()"
              (valueChange)="onLiquidityFilterChange($event)"
              [itemToString]="liquidityToString"
            >
              <hlm-select-trigger class="w-48">
                <hlm-select-value placeholder="All liquidity classes" />
              </hlm-select-trigger>
              <hlm-select-content *hlmSelectPortal>
                @for (option of liquidityClasses; track option.value) {
                  <hlm-select-item [value]="option.value">{{ option.label }}</hlm-select-item>
                }
              </hlm-select-content>
            </hlm-select>
          </div>
          @if (liquidityFilter()) {
            <button hlmBtn variant="ghost" size="sm" type="button" (click)="clearLiquidityFilter()">
              Clear filter
            </button>
          }
        </div>

        @if (groupedRows().length === 0) {
          <p class="text-muted-foreground text-sm">No accounts match this filter.</p>
        }

        @for (group of groupedRows(); track group.type) {
          <div class="flex flex-col gap-3">
            <div class="flex items-baseline justify-between gap-2">
              <h2 class="text-lg font-semibold">{{ accountTypeLabel(group.type) }}</h2>
              <span
                class="font-medium"
                [class.text-destructive]="group.subtotal < 0"
              >
                {{ group.subtotal | number: '1.2-2' }}
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
                    <p class="text-muted-foreground text-sm">
                      @if (row.valued_on) {
                        Valued {{ row.valued_on | date: 'mediumDate' }}
                      } @else {
                        No valuation recorded yet
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
                      View history
                    </a>
                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      routerLink="/net-worth/valuations/new"
                      [queryParams]="{ accountId: row.account_id }"
                    >
                      Add valuation
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

  protected readonly liquidityClasses = LIQUIDITY_CLASSES;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly asOf = signal(new Date());
  protected readonly liquidityFilter = signal<AssetLiquidityClass | undefined>(undefined);
  protected readonly rows = this.netWorth.summary;
  protected readonly asOfLabel = computed(() =>
    this.asOf().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
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
      subtotal: rows.reduce((total, row) => total + row.signed_value, 0),
    }));
  });

  protected readonly liquidityToString = (value: AssetLiquidityClass): string =>
    this.liquidityLabel(value);

  constructor() {
    void this.loadAll();
  }

  protected accountTypeLabel(type: NetWorthSummaryRow['account_type']): string {
    return type
      .split('_')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected liquidityLabel(liquidity: AssetLiquidityClass): string {
    return LIQUIDITY_CLASSES.find((option) => option.value === liquidity)?.label ?? liquidity;
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
