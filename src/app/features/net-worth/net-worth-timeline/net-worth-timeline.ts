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

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/** `YYYY-MM`, so a column can be compared against a valuation's own month. */
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * What one account shows in one month's column, or null for an empty cell.
 *
 * An account that wasn't re-valued in a given month still holds whatever it
 * held, so `get_net_worth_summary` carries its last figure forward -- right for
 * a live account, wrong for an archived one. Accounts are rarely zeroed out
 * before being archived, so without this cut-off a closed account's final
 * balance would be counted in every month from then on, for good.
 *
 * `lastValuedMonth` is `YYYY-MM` of the newest valuation known for the account.
 */
export function timelineCellValue(
  row: NetWorthSummaryRow | undefined,
  column: Date,
  account: { archived: boolean; lastValuedMonth: string | undefined },
): number | null {
  if (!row || row.valuation_id === null) {
    return null;
  }

  if (account.archived) {
    if (account.lastValuedMonth === undefined || monthKey(column) > account.lastValuedMonth) {
      return null;
    }
  }

  return row.signed_value_in_base ?? row.signed_value;
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

  /**
   * Active accounts always get a row. An archived one does too, but only for
   * windows where it actually held something: archiving says "this is done
   * with", not "this never happened", so its balances still belong to the
   * months it was live -- and to those months' totals. Past its lifetime
   * `cellValue` blanks every cell, so the row drops out of later windows.
   */
  protected readonly accounts = computed(() => {
    const monthCount = this.months().length;
    const heldSomethingInWindow = (accountId: string) =>
      Array.from({ length: monthCount }, (_, index) => this.cellValue(accountId, index)).some(
        (value) => value !== null && value !== 0,
      );

    return this.netWorth
      .accounts()
      .filter((account) => !account.archived || heldSomethingInWindow(account.id));
  });
  protected readonly baseCurrency = computed(
    () => this.households.currentHousehold()?.base_currency ?? 'PLN',
  );

  protected readonly months = computed(() => {
    const end = this.windowEnd();
    return Array.from({ length: WINDOW_SIZE }, (_, i) => addMonths(end, i - (WINDOW_SIZE - 1)));
  });

  /**
   * A column headed "Jul 26" means "where things stood at the end of July", so
   * each column is queried as of the month's last day. Querying the first day
   * instead would show the previous month's closing balances under this
   * month's heading, and hide anything recorded during the month itself.
   */
  private readonly monthEnds = computed(() => this.months().map(endOfMonth));

  private readonly monthMaps = computed(() =>
    this.monthlyRows().map((rows) => new Map(rows.map((row) => [row.account_id, row]))),
  );

  private readonly archivedAccountIds = computed(
    () =>
      new Set(
        this.netWorth
          .accounts()
          .filter((account) => account.archived)
          .map((account) => account.id),
      ),
  );

  /**
   * The last month each account was actually valued in, as far as this window
   * can see. The summary carries the newest valuation at or before a column
   * forward, so the latest column's row already names that valuation's date.
   */
  private readonly lastValuedMonth = computed(() => {
    const lastValued = new Map<string, string>();

    for (const month of this.monthMaps()) {
      for (const [accountId, row] of month) {
        if (row.valued_on !== null) {
          lastValued.set(accountId, row.valued_on.slice(0, 7));
        }
      }
    }

    return lastValued;
  });

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
    return timelineCellValue(this.monthMaps()[monthIndex]?.get(accountId), this.months()[monthIndex], {
      archived: this.archivedAccountIds().has(accountId),
      lastValuedMonth: this.lastValuedMonth().get(accountId),
    });
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
    const rows = await this.netWorth.loadTimeline(this.monthEnds());
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
