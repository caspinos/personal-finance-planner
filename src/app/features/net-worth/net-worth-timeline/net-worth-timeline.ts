import { DecimalPipe } from '@angular/common';
import { Component, LOCALE_ID, computed, inject, signal } from '@angular/core';
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
import { ChangeChart } from '../../../shared/charts/change-chart';
import { ChartPoint } from '../../../shared/charts/chart-geometry';
import { TrendChart } from '../../../shared/charts/trend-chart';

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
 * The cut-off reads `last_valued_on`, which covers the account's whole history.
 * Taking it from the rows on screen instead would misjudge any window that ends
 * before the account's final valuation: every row there carries some earlier
 * valuation forward, which would look like the account had ended back then.
 */
export function timelineCellValue(
  row: NetWorthSummaryRow | undefined,
  column: Date,
  archived: boolean,
): number | null {
  if (!row || row.valuation_id === null) {
    return null;
  }

  if (archived) {
    if (row.last_valued_on === null || monthKey(column) > row.last_valued_on.slice(0, 7)) {
      return null;
    }
  }

  return row.value_in_base ?? row.value;
}

/**
 * Sums one column, or returns null for a month no account has a figure in.
 *
 * Treating those as zero would be a claim the data doesn't make: a window that
 * reaches back before the first valuation would show a net worth of zero, and
 * the month the first account appears would read as a jump from nothing.
 */
export function columnTotal(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
}

/** Month-over-month deltas; null wherever either month is itself unknown. */
export function monthOverMonthChanges(totals: Array<number | null>): Array<number | null> {
  return totals.map((total, index) => {
    const previous = index === 0 ? null : totals[index - 1];
    return total === null || previous === null ? null : total - previous;
  });
}

@Component({
  selector: 'app-net-worth-timeline',
  imports: [
    DecimalPipe,
    RouterLink,
    ChangeChart,
    TrendChart,
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
          <a hlmBtn variant="ghost" size="sm" class="self-start" routerLink="/net-worth">{{
            'netWorthTimeline.back' | transloco
          }}</a>
          <div>
            <h1 class="text-2xl font-semibold">{{ 'netWorthTimeline.title' | transloco }}</h1>
            <p class="text-muted-foreground text-sm">
              {{ 'netWorthTimeline.subtitle' | transloco: { currency: baseCurrency() } }}
            </p>
          </div>
        </div>

        <div class="hidden items-center gap-2 md:flex">
          <button hlmBtn variant="outline" size="sm" type="button" (click)="previousWindow()">
            &lsaquo; {{ 'netWorthTimeline.previous' | transloco }}
          </button>
          <button hlmBtn variant="outline" size="sm" type="button" (click)="nextWindow()">
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
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
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
        <div class="grid gap-4 xl:grid-cols-2">
          <div hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>{{ 'netWorthTimeline.trendTitle' | transloco }}</h2>
              <p hlmCardDescription>
                {{ 'netWorthTimeline.trendDescription' | transloco: { currency: baseCurrency() } }}
              </p>
            </div>
            <div hlmCardContent class="flex flex-col gap-3">
              @if (hasChartData()) {
                <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    class="text-2xl font-semibold"
                    [class.text-destructive]="latestTotalIsNegative()"
                  >
                    {{ latestTotal() | number: '1.0-0' }} {{ baseCurrency() }}
                  </span>
                  @if (latestChange() !== null) {
                    <span
                      class="text-sm font-medium tabular-nums"
                      [class.text-destructive]="(latestChange() ?? 0) < 0"
                    >
                      {{ signed(latestChange()) }}
                      <span class="text-muted-foreground font-normal">
                        {{ 'netWorthTimeline.sinceLastMonth' | transloco }}
                      </span>
                    </span>
                  }
                </div>
                <app-trend-chart
                  [points]="trendPoints()"
                  [unit]="baseCurrency()"
                  [ariaLabel]="'netWorthTimeline.trendAria' | transloco"
                />
              } @else {
                <p class="text-muted-foreground text-sm">
                  {{ 'netWorthTimeline.notEnoughData' | transloco }}
                </p>
              }
            </div>
          </div>

          <div hlmCard>
            <div hlmCardHeader>
              <h2 hlmCardTitle>{{ 'netWorthTimeline.changeTitle' | transloco }}</h2>
              <p hlmCardDescription>
                {{ 'netWorthTimeline.changeDescription' | transloco: { currency: baseCurrency() } }}
              </p>
            </div>
            <div hlmCardContent>
              @if (hasChangeData()) {
                <app-change-chart
                  [points]="changePoints()"
                  [unit]="baseCurrency()"
                  [ariaLabel]="'netWorthTimeline.changeAria' | transloco"
                />
              } @else {
                <p class="text-muted-foreground text-sm">
                  {{ 'netWorthTimeline.notEnoughData' | transloco }}
                </p>
              }
            </div>
          </div>
        </div>

        <!--
          A twelve-column table is unreadable on a phone: the sticky name column
          plus one month is all that fits, so every other month is behind a
          horizontal scroll. Below md the same figures are shown one month at a
          time instead, stepped through with the control above.
        -->
        <div class="flex flex-col gap-3 md:hidden">
          <div class="flex items-center justify-between gap-2">
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              (click)="selectPreviousMonth()"
              [attr.aria-label]="'netWorthTimeline.previousMonth' | transloco"
            >
              <span aria-hidden="true">&lsaquo;</span>
            </button>
            <p class="text-base font-semibold" aria-live="polite">
              {{ longMonthLabel(months()[selectedMonthIndex()]) }}
            </p>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              (click)="selectNextMonth()"
              [attr.aria-label]="'netWorthTimeline.nextMonth' | transloco"
            >
              <span aria-hidden="true">&rsaquo;</span>
            </button>
          </div>

          <div hlmCard>
            <div hlmCardContent class="flex flex-col gap-4 py-4">
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-semibold">{{ 'netWorthTimeline.total' | transloco }}</span>
                <span class="text-right">
                  @let selectedTotal = columnTotals()[selectedMonthIndex()];
                  <span
                    class="block text-lg font-semibold tabular-nums"
                    [class.text-destructive]="(selectedTotal ?? 0) < 0"
                  >
                    @if (selectedTotal === null) {
                      &ndash;
                    } @else {
                      {{ selectedTotal | number: '1.0-0' }}
                    }
                  </span>
                  @let selectedChange = columnChanges()[selectedMonthIndex()];
                  @if (selectedChange !== null) {
                    <span
                      class="block text-xs tabular-nums"
                      [class.text-destructive]="(selectedChange ?? 0) < 0"
                      [class.text-muted-foreground]="(selectedChange ?? 0) >= 0"
                    >
                      {{ signed(selectedChange) }}
                      {{ 'netWorthTimeline.changeMoM' | transloco }}
                    </span>
                  }
                </span>
              </div>

              @for (group of groupedAccounts(); track group.type) {
                <div class="flex flex-col gap-1">
                  <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {{ accountTypeLabel(group.type) }}
                  </h3>
                  <dl class="flex flex-col">
                    @for (account of group.accounts; track account.id) {
                      <div
                        class="border-border/60 flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0"
                      >
                        <dt class="min-w-0 break-words">{{ account.name }}</dt>
                        <dd class="shrink-0 text-right">
                          @let value = cellValue(account.id, selectedMonthIndex());
                          <span
                            class="block tabular-nums"
                            [class.text-destructive]="(value ?? 0) < 0"
                          >
                            @if (value === null) {
                              &ndash;
                            } @else {
                              {{ value | number: '1.0-0' }}
                            }
                          </span>
                          @let delta = accountChange(account.id, selectedMonthIndex());
                          @if (delta !== null && delta !== 0) {
                            <span
                              class="block text-xs tabular-nums"
                              [class.text-destructive]="(delta ?? 0) < 0"
                              [class.text-muted-foreground]="(delta ?? 0) >= 0"
                            >
                              {{ signed(delta) }}
                            </span>
                          }
                        </dd>
                      </div>
                    }
                  </dl>
                </div>
              }
            </div>
          </div>
        </div>

        <div hlmCard class="hidden overflow-hidden md:block">
          <div class="overflow-x-auto">
            <table class="w-full min-w-max text-sm">
              <caption class="sr-only">
                {{
                  'netWorthTimeline.tableCaption' | transloco: { currency: baseCurrency() }
                }}
              </caption>
              <thead>
                <tr class="border-border border-b">
                  <th
                    scope="col"
                    class="bg-card sticky left-0 z-10 min-w-48 px-3 py-2 text-left font-medium"
                  >
                    {{ 'netWorthTimeline.item' | transloco }}
                  </th>
                  @for (month of months(); track month.getTime()) {
                    <th scope="col" class="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {{ monthLabel(month) }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (group of groupedAccounts(); track group.type) {
                  <tr class="bg-muted/50">
                    <th
                      scope="rowgroup"
                      class="bg-muted/50 sticky left-0 z-10 px-3 py-1.5 text-left font-semibold"
                      [attr.colspan]="months().length + 1"
                    >
                      {{ accountTypeLabel(group.type) }}
                    </th>
                  </tr>
                  @for (account of group.accounts; track account.id) {
                    <tr class="border-border/60 border-b">
                      <th
                        scope="row"
                        class="bg-card sticky left-0 z-10 px-3 py-1.5 text-left font-normal"
                      >
                        {{ account.name }}
                      </th>
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
                  <th scope="row" class="bg-card sticky left-0 z-10 px-3 py-2 text-left">
                    {{ 'netWorthTimeline.total' | transloco }}
                  </th>
                  @for (total of columnTotals(); track $index) {
                    <td
                      class="px-3 py-2 text-right tabular-nums whitespace-nowrap"
                      [class.text-destructive]="(total ?? 0) < 0"
                    >
                      @if (total === null) {
                        &ndash;
                      } @else {
                        {{ total | number: '1.0-0' }}
                      }
                    </td>
                  }
                </tr>
                <tr class="text-muted-foreground">
                  <th
                    scope="row"
                    class="bg-card sticky left-0 z-10 px-3 py-2 text-left font-normal"
                  >
                    {{ 'netWorthTimeline.changeMoM' | transloco }}
                  </th>
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
  /** Numbers follow the app locale, dates the chosen language -- as elsewhere in the app. */
  private readonly locale = inject(LOCALE_ID);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly windowEnd = signal(startOfMonth(new Date()));
  protected readonly monthlyRows = signal<NetWorthSummaryRow[][]>([]);
  /** Which month the small-screen layout is showing; the table shows all of them. */
  protected readonly selectedMonthIndex = signal(WINDOW_SIZE - 1);

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
      columnTotal(this.accounts().map((account) => this.cellValue(account.id, monthIndex))),
    ),
  );

  protected readonly columnChanges = computed(() => monthOverMonthChanges(this.columnTotals()));

  protected readonly trendPoints = computed<ChartPoint[]>(() =>
    this.months().map((month, index) => ({
      label: this.monthLabel(month),
      value: this.columnTotals()[index],
    })),
  );

  protected readonly changePoints = computed<ChartPoint[]>(() =>
    this.months().map((month, index) => ({
      label: this.monthLabel(month),
      value: this.columnChanges()[index],
    })),
  );

  /** A line needs at least two plotted months before it says anything. */
  protected readonly hasChartData = computed(
    () => this.columnTotals().filter((total) => total !== null).length >= 2,
  );

  protected readonly hasChangeData = computed(() =>
    this.columnChanges().some((change) => change !== null),
  );

  protected readonly latestTotal = computed(() => {
    const known = this.columnTotals().filter((total): total is number => total !== null);
    return known.length > 0 ? known[known.length - 1] : null;
  });

  protected readonly latestTotalIsNegative = computed(() => (this.latestTotal() ?? 0) < 0);

  protected readonly latestChange = computed(() => {
    const totals = this.columnTotals();
    const lastKnown = totals.reduce<number>(
      (last, total, index) => (total === null ? last : index),
      -1,
    );

    return lastKnown <= 0 ? null : this.columnChanges()[lastKnown];
  });

  constructor() {
    void this.loadAll();
  }

  protected cellValue(accountId: string, monthIndex: number): number | null {
    return timelineCellValue(
      this.monthMaps()[monthIndex]?.get(accountId),
      this.months()[monthIndex],
      this.archivedAccountIds().has(accountId),
    );
  }

  /** One account's month-over-month move, for the small-screen list. */
  protected accountChange(accountId: string, monthIndex: number): number | null {
    if (monthIndex === 0) {
      return null;
    }

    const current = this.cellValue(accountId, monthIndex);
    const previous = this.cellValue(accountId, monthIndex - 1);

    return current === null || previous === null ? null : current - previous;
  }

  /** `+1,200` / `-340`, so a delta reads as a direction without relying on colour. */
  protected signed(value: number | null): string {
    if (value === null) {
      return '';
    }

    return new Intl.NumberFormat(this.locale, {
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    }).format(value);
  }

  protected monthLabel(month: Date): string {
    return month.toLocaleDateString(this.language.localeTag(), {
      month: 'short',
      year: '2-digit',
    });
  }

  protected longMonthLabel(month: Date): string {
    return month.toLocaleDateString(this.language.localeTag(), {
      month: 'long',
      year: 'numeric',
    });
  }

  protected accountTypeLabel(type: AssetAccountType): string {
    return this.transloco.translate(`netWorth.accountType.${type}`);
  }

  /**
   * Steps the small-screen view one month at a time, rolling into the
   * neighbouring window at either edge. A phone has no use for the twelve-month
   * pager the table needs, so this is the only month control it shows.
   */
  protected selectPreviousMonth(): void {
    if (this.selectedMonthIndex() > 0) {
      this.selectedMonthIndex.update((index) => index - 1);
      return;
    }

    this.windowEnd.update((end) => addMonths(end, -WINDOW_SIZE));
    this.selectedMonthIndex.set(WINDOW_SIZE - 1);
    void this.reloadTimeline();
  }

  protected selectNextMonth(): void {
    if (this.selectedMonthIndex() < WINDOW_SIZE - 1) {
      this.selectedMonthIndex.update((index) => index + 1);
      return;
    }

    this.windowEnd.update((end) => addMonths(end, WINDOW_SIZE));
    this.selectedMonthIndex.set(0);
    void this.reloadTimeline();
  }

  protected previousWindow(): void {
    this.windowEnd.update((end) => addMonths(end, -WINDOW_SIZE));
    this.selectedMonthIndex.set(WINDOW_SIZE - 1);
    void this.reloadTimeline();
  }

  protected nextWindow(): void {
    this.windowEnd.update((end) => addMonths(end, WINDOW_SIZE));
    this.selectedMonthIndex.set(WINDOW_SIZE - 1);
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
