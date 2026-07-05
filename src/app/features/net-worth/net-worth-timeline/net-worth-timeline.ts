import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { HouseholdService } from '../../../core/household/household.service';
import { LanguageService } from '../../../core/i18n/language.service';
import {
  AssetAccount,
  AssetAccountType,
  NetWorthService,
  NetWorthSummaryRow,
} from '../../../core/net-worth/net-worth.service';

const WINDOW_SIZE = 12;

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

@Component({
  selector: 'app-net-worth-timeline',
  imports: [
    DecimalPipe,
    RouterLink,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSpinnerImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-col gap-2">
          <a hlmBtn variant="ghost" size="sm" routerLink="/net-worth">{{
            'netWorthTimeline.back' | transloco
          }}</a>
          <div>
            <h1 class="text-2xl font-semibold">{{ 'netWorthTimeline.title' | transloco }}</h1>
            <p class="text-muted-foreground text-sm">
              {{ 'netWorthTimeline.subtitle' | transloco: { currency: baseCurrency() } }}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="previousWindow()"
            aria-label="Previous 12 months"
          >
            &lsaquo; {{ 'netWorthTimeline.previous' | transloco }}
          </button>
          <button
            hlmBtn
            variant="outline"
            size="sm"
            type="button"
            (click)="nextWindow()"
            aria-label="Next 12 months"
          >
            {{ 'netWorthTimeline.next' | transloco }} &rsaquo;
          </button>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ 'netWorthTimeline.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      @if (loading()) {
        <div class="flex items-center gap-2 text-sm text-muted-foreground">
          <hlm-spinner />
          {{ 'netWorthTimeline.loading' | transloco }}
        </div>
      } @else if (accounts().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'netWorth.noAccountsTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'netWorth.noAccountsDescription' | transloco }}</p>
          </div>
        </div>
      } @else {
        <div hlmCard class="overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full min-w-max text-sm">
              <thead>
                <tr class="border-border border-b">
                  <th
                    class="bg-card sticky left-0 z-10 min-w-48 px-3 py-2 text-left font-medium"
                  >
                    {{ 'netWorthTimeline.item' | transloco }}
                  </th>
                  @for (month of months(); track month.getTime()) {
                    <th class="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {{ monthLabel(month) }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (group of groupedAccounts(); track group.type) {
                  <tr class="bg-muted/50">
                    <td
                      class="bg-muted/50 sticky left-0 z-10 px-3 py-1.5 font-semibold"
                      [attr.colspan]="months().length + 1"
                    >
                      {{ accountTypeLabel(group.type) }}
                    </td>
                  </tr>
                  @for (account of group.accounts; track account.id) {
                    <tr class="border-border/60 border-b">
                      <td class="bg-card sticky left-0 z-10 px-3 py-1.5">{{ account.name }}</td>
                      @for (month of months(); track month.getTime(); let i = $index) {
                        <td
                          class="px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
                          [class.text-destructive]="(cellValue(account.id, i) ?? 0) < 0"
                        >
                          @let value = cellValue(account.id, i);
                          @if (value === null) {
                            &ndash;
                          } @else {
                            {{ value | number: '1.0-0' }}
                          }
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
              <tfoot>
                <tr class="border-border border-t-2 font-semibold">
                  <td class="bg-card sticky left-0 z-10 px-3 py-2">
                    {{ 'netWorthTimeline.total' | transloco }}
                  </td>
                  @for (total of columnTotals(); track $index) {
                    <td
                      class="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                      [class.text-destructive]="total < 0"
                    >
                      {{ total | number: '1.0-0' }}
                    </td>
                  }
                </tr>
                <tr class="text-muted-foreground">
                  <td class="bg-card sticky left-0 z-10 px-3 py-2">
                    {{ 'netWorthTimeline.changeMoM' | transloco }}
                  </td>
                  @for (change of columnChanges(); track $index) {
                    <td
                      class="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                      [class.text-destructive]="(change ?? 0) < 0"
                    >
                      @if (change === null) {
                        &ndash;
                      } @else {
                        {{ change | number: '1.0-0' }}
                      }
                    </td>
                  }
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        @if (netWorth.hasUnconvertedRows()) {
          <p class="text-muted-foreground text-xs">
            {{ 'netWorth.unconvertedNotice' | transloco }}
            <a routerLink="/rates" class="underline">{{ 'netWorth.addRate' | transloco }}</a>
          </p>
        }
      }
    </div>
  `,
})
export class NetWorthTimeline {
  protected readonly netWorth = inject(NetWorthService);
  private readonly households = inject(HouseholdService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly windowEnd = signal(startOfMonth(new Date()));
  protected readonly monthlyRows = signal<NetWorthSummaryRow[][]>([]);

  protected readonly accounts = this.netWorth.activeAccounts;
  protected readonly baseCurrency = computed(
    () => this.households.currentHousehold()?.base_currency ?? 'PLN',
  );

  protected readonly months = computed(() => {
    const end = this.windowEnd();
    return Array.from({ length: WINDOW_SIZE }, (_, i) => addMonths(end, i - (WINDOW_SIZE - 1)));
  });

  private readonly monthMaps = computed(() =>
    this.monthlyRows().map((rows) => new Map(rows.map((row) => [row.account_id, row]))),
  );

  protected readonly groupedAccounts = computed(() => {
    const groups = new Map<AssetAccountType, AssetAccount[]>();

    for (const account of this.accounts()) {
      const accountsForType = groups.get(account.type) ?? [];
      accountsForType.push(account);
      groups.set(account.type, accountsForType);
    }

    return Array.from(groups.entries()).map(([type, accounts]) => ({ type, accounts }));
  });

  protected readonly columnTotals = computed(() =>
    this.months().map((_, monthIndex) =>
      this.accounts().reduce((total, account) => total + (this.cellValue(account.id, monthIndex) ?? 0), 0),
    ),
  );

  protected readonly columnChanges = computed(() => {
    const totals = this.columnTotals();
    return totals.map((total, i) => (i === 0 ? null : total - totals[i - 1]));
  });

  constructor() {
    void this.loadAll();
  }

  protected cellValue(accountId: string, monthIndex: number): number | null {
    const row = this.monthMaps()[monthIndex]?.get(accountId);
    if (!row || row.valuation_id === null) {
      return null;
    }
    return row.signed_value_in_base ?? row.signed_value;
  }

  protected monthLabel(month: Date): string {
    return month.toLocaleDateString(this.language.localeTag(), {
      month: 'short',
      year: '2-digit',
    });
  }

  protected accountTypeLabel(type: AssetAccountType): string {
    return this.transloco.translate(`netWorth.accountType.${type}`);
  }

  protected previousWindow(): void {
    this.windowEnd.update((end) => addMonths(end, -WINDOW_SIZE));
    void this.reloadTimeline();
  }

  protected nextWindow(): void {
    this.windowEnd.update((end) => addMonths(end, WINDOW_SIZE));
    void this.reloadTimeline();
  }

  private async reloadTimeline(): Promise<void> {
    this.errorMessage.set(null);

    try {
      await this.loadTimeline();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    }
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.loadAccounts();
      await this.loadTimeline();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadTimeline(): Promise<void> {
    const rows = await this.netWorth.loadTimeline(this.months());
    this.monthlyRows.set(rows);
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
