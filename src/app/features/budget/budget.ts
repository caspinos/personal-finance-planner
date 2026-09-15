import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronLeft,
  lucideChevronRight,
  lucideHistory,
  lucidePause,
  lucidePencil,
  lucidePlay,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { BudgetService } from '../../core/budget/budget.service';
import { HouseholdService } from '../../core/household/household.service';
import { LanguageService } from '../../core/i18n/language.service';
import { EnvelopePace, envelopePace, monthElapsedRatio } from './budget-pace';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

@Component({
  selector: 'app-budget',
  imports: [
    NgIcon,
    RouterLink,
    DecimalPipe,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSpinnerImports,
    TranslocoModule,
  ],
  providers: [
    provideIcons({
      lucideChevronLeft,
      lucideChevronRight,
      lucideHistory,
      lucidePause,
      lucidePencil,
      lucidePlay,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-1">
          <button
            hlmBtn
            variant="outline"
            size="icon-sm"
            type="button"
            (click)="previousMonth()"
            aria-label="Previous month"
          >
            <ng-icon name="lucideChevronLeft" />
          </button>
          <span class="min-w-32 text-center text-sm font-medium">{{ monthLabel() }}</span>
          <button
            hlmBtn
            variant="outline"
            size="icon-sm"
            type="button"
            (click)="nextMonth()"
            aria-label="Next month"
          >
            <ng-icon name="lucideChevronRight" />
          </button>
        </div>

        <div class="flex flex-wrap gap-1.5">
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget/history">{{
            'budget.history' | transloco
          }}</a>
          <a hlmBtn variant="outline" size="sm" routerLink="/budget/transfers/new">{{
            'budget.transfer' | transloco
          }}</a>
          <a hlmBtn size="sm" routerLink="/budget/transactions/new">{{
            'budget.recordTransaction' | transloco
          }}</a>
          <a hlmBtn variant="secondary" size="sm" routerLink="/budget/funding/new">{{
            'budget.fundEnvelopes' | transloco
          }}</a>
          <a hlmBtn variant="secondary" size="sm" routerLink="/budget/envelopes/new">{{
            'budget.newEnvelope' | transloco
          }}</a>
          <a hlmBtn variant="secondary" size="sm" routerLink="/budget/recurring/new">{{
            'budget.newRecurringRule' | transloco
          }}</a>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ 'budget.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      @if (loading()) {
        <p class="text-muted-foreground text-sm">{{ 'budget.loadingEnvelopes' | transloco }}</p>
      } @else if (envelopes().length === 0) {
        <div hlmCard size="sm" class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'budget.noEnvelopesTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'budget.noEnvelopesDescription' | transloco }}</p>
          </div>
        </div>
      } @else {
        <ul class="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          @for (envelope of envelopes(); track envelope.id) {
            @let pace = paces()[envelope.id];
            <li hlmCard size="sm" class="relative">
              <!-- Budget consumed, filling left to right; amber once spending
                   has outrun the month, green while it is still behind it. -->
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-y-0 left-0"
                [class.bg-budget-on-track]="!pace.overPace"
                [class.bg-budget-over-pace]="pace.overPace"
                [style.width.%]="pace.fillRatio * 100"
              ></div>
              <!-- How far into the month we are. Only drawn for a month that is
                   actually running: for a past or future one it would sit flat
                   against an edge and say nothing. -->
              @if (elapsedRatio() > 0 && elapsedRatio() < 1) {
                <div
                  aria-hidden="true"
                  class="bg-muted-foreground/50 pointer-events-none absolute inset-y-0 w-px"
                  [style.left.%]="elapsedRatio() * 100"
                ></div>
              }
              <div class="relative flex items-center gap-2 px-3">
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-baseline justify-between gap-2">
                    <h2 class="truncate text-sm font-medium" [title]="envelope.name">
                      {{ envelope.name }}
                    </h2>
                    <span class="sr-only">
                      {{
                        (pace.hasBudget ? 'budget.pace' : 'budget.paceNoBudget')
                          | transloco: { used: pace.usedPercent, elapsed: elapsedPercent() }
                      }}
                    </span>
                    <span
                      class="shrink-0 text-sm font-semibold tabular-nums"
                      [class.text-destructive]="(balances()[envelope.id]?.balance ?? 0) < 0"
                    >
                      {{ balances()[envelope.id]?.balance ?? 0 | number: '1.2-2' }} PLN
                    </span>
                  </div>

                  @if (baseCurrency() !== 'PLN') {
                    <p class="text-muted-foreground text-right text-xs tabular-nums">
                      @if (balances()[envelope.id]?.balance_in_base != null) {
                        &approx; {{ balances()[envelope.id]?.balance_in_base | number: '1.2-2' }}
                        {{ baseCurrency() }}
                      } @else {
                        {{ 'budget.noRateSet' | transloco: { currency: baseCurrency() } }}
                      }
                    </p>
                  }
                </div>

                <div class="flex shrink-0 items-center gap-0.5">
                  <a
                    hlmBtn
                    variant="ghost"
                    size="icon-sm"
                    [routerLink]="['/budget/envelopes', envelope.id]"
                    [attr.aria-label]="'budget.viewHistory' | transloco"
                    [title]="'budget.viewHistory' | transloco"
                  >
                    <ng-icon name="lucideHistory" />
                  </a>
                  <a
                    hlmBtn
                    variant="ghost"
                    size="icon-sm"
                    [routerLink]="['/budget/envelopes', envelope.id, 'edit']"
                    [attr.aria-label]="'budget.rename' | transloco"
                    [title]="'budget.rename' | transloco"
                  >
                    <ng-icon name="lucidePencil" />
                  </a>
                </div>
              </div>
            </li>
          }
        </ul>
      }

      <div hlmCard size="sm">
        <div hlmCardHeader>
          <h2 hlmCardTitle>{{ 'budget.recurringRulesTitle' | transloco }}</h2>
          <p hlmCardDescription>
            {{ 'budget.recurringRulesDescription' | transloco }}
          </p>
        </div>
        <div hlmCardContent>
          @if (recurringRules().length === 0) {
            <p class="text-muted-foreground text-sm">
              {{ 'budget.noRecurringRules' | transloco }}
            </p>
          } @else {
            <ul class="border-border divide-border divide-y rounded-md border">
              @for (rule of recurringRules(); track rule.id) {
                <li class="flex items-center gap-2 px-3 py-2">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="truncate text-sm font-medium">{{ rule.name }}</span>
                      <span class="shrink-0 text-sm font-medium tabular-nums">
                        {{ rule.amount | number: '1.2-2' }} PLN
                      </span>
                    </div>
                    <p class="text-muted-foreground truncate text-xs">
                      {{ (rule.type === 'income' ? 'budget.topUp' : 'budget.charge') | transloco }}
                      &middot; {{ envelopeName(rule.envelope_id) }} &middot;
                      {{ 'budget.dayOfMonth' | transloco: { day: rule.day_of_month } }}
                      &middot; {{ 'budget.nextRun' | transloco: { date: rule.next_run_on } }}
                      @if (!rule.active) {
                        &middot; {{ 'budget.paused' | transloco }}
                      }
                    </p>
                  </div>

                  <div class="flex shrink-0 items-center gap-0.5">
                    <a
                      hlmBtn
                      variant="ghost"
                      size="icon-sm"
                      [routerLink]="['/budget/recurring', rule.id, 'edit']"
                      [attr.aria-label]="'common.edit' | transloco"
                      [title]="'common.edit' | transloco"
                    >
                      <ng-icon name="lucidePencil" />
                    </a>
                    <button
                      hlmBtn
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      [disabled]="togglingId() === rule.id"
                      (click)="toggleActive(rule)"
                      [attr.aria-label]="
                        (rule.active ? 'budget.pause' : 'budget.resume') | transloco
                      "
                      [title]="(rule.active ? 'budget.pause' : 'budget.resume') | transloco"
                    >
                      @if (togglingId() === rule.id) {
                        <hlm-spinner />
                      } @else {
                        <ng-icon [name]="rule.active ? 'lucidePause' : 'lucidePlay'" />
                      }
                    </button>
                    <button
                      hlmBtn
                      variant="destructive"
                      size="icon-sm"
                      type="button"
                      [disabled]="deletingId() === rule.id"
                      (click)="deleteRule(rule)"
                      [attr.aria-label]="'common.delete' | transloco"
                      [title]="'common.delete' | transloco"
                    >
                      @if (deletingId() === rule.id) {
                        <hlm-spinner />
                      } @else {
                        <ng-icon name="lucideTrash2" />
                      }
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    </div>
  `,
})
export class Budget {
  private readonly budget = inject(BudgetService);
  private readonly households = inject(HouseholdService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  private readonly destroyRef = inject(DestroyRef);
  private dateRefreshTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly today = signal(new Date());
  protected readonly month = signal(startOfMonth(this.today()));
  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly balances = this.budget.balances;
  protected readonly recurringRules = this.budget.recurringRules;
  protected readonly togglingId = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly baseCurrency = computed(
    () => this.households.currentHousehold()?.base_currency ?? 'PLN',
  );

  protected readonly monthLabel = computed(() =>
    this.month().toLocaleDateString(this.language.localeTag(), { month: 'long', year: 'numeric' }),
  );

  /** Share of the displayed month already behind us; drives the vertical marker. */
  protected readonly elapsedRatio = computed(() => monthElapsedRatio(this.month(), this.today()));
  protected readonly elapsedPercent = computed(() => Math.round(this.elapsedRatio() * 100));

  /**
   * Budget-usage-versus-time for every envelope, keyed by id. Spending comes from
   * the month's own charges, while the denominator is derived from the balance
   * left at the end of it -- see `envelopePace`.
   */
  protected readonly paces = computed<Record<string, EnvelopePace>>(() => {
    const elapsed = this.elapsedRatio();
    const spending = this.budget.monthlySpending();
    const balances = this.balances();

    const paces: Record<string, EnvelopePace> = {};
    for (const envelope of this.envelopes()) {
      paces[envelope.id] = envelopePace(
        spending[envelope.id] ?? 0,
        balances[envelope.id]?.balance ?? 0,
        elapsed,
      );
    }

    return paces;
  });

  constructor() {
    this.scheduleDateRefresh();
    this.destroyRef.onDestroy(() => clearTimeout(this.dateRefreshTimer));
    void this.loadAll();
  }

  protected previousMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    this.reloadMonth();
  }

  protected nextMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    this.reloadMonth();
  }

  protected envelopeName(envelopeId: string): string {
    return this.budget.envelopes().find((envelope) => envelope.id === envelopeId)?.name ?? '';
  }

  protected async toggleActive(rule: { id: string; active: boolean }): Promise<void> {
    this.togglingId.set(rule.id);

    try {
      await this.budget.setRecurringRuleActive(rule.id, !rule.active);
    } finally {
      this.togglingId.set(null);
    }
  }

  protected async deleteRule(rule: { id: string; name: string }): Promise<void> {
    const confirmed = window.confirm(
      this.transloco.translate('budget.deleteRuleConfirm', { name: rule.name }),
    );
    if (!confirmed) {
      return;
    }

    this.deletingId.set(rule.id);

    try {
      await this.budget.deleteRecurringRule(rule.id);
    } finally {
      this.deletingId.set(null);
    }
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.budget.loadEnvelopes();
      await this.budget.processDueRecurringRules();
      await Promise.all([this.loadMonth(), this.budget.loadRecurringRules()]);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /** Month switches surface their own failures rather than rejecting unheard. */
  private reloadMonth(): void {
    this.errorMessage.set(null);
    void this.loadMonth().catch((error: unknown) =>
      this.errorMessage.set(this.extractMessage(error)),
    );
  }

  /**
   * Both sides of the pace ratio are measured over the whole month, never up to
   * today: the balance the tile shows is the end-of-month one, so an expense or
   * a top-up booked for later this month is already in the denominator and has
   * to be in the numerator too. Cutting the spending window at today instead
   * would shrink the budget an envelope is judged against and overstate its
   * usage.
   */
  private async loadMonth(): Promise<void> {
    this.refreshToday();
    const month = this.month();

    await Promise.all([
      this.budget.loadBalances(endOfMonth(month)),
      this.budget.loadMonthlySpending(month, endOfMonth(month)),
    ]);
  }

  /**
   * Keeps `today` on the actual current day: the page can sit open across
   * midnight, and a stale date would leave the elapsed-month marker a day
   * behind (and with it the green/amber verdict).
   */
  private scheduleDateRefresh(): void {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.dateRefreshTimer = setTimeout(() => {
      this.today.set(new Date());
      this.scheduleDateRefresh();
    }, nextMidnight.getTime() - now.getTime());
  }

  private refreshToday(): void {
    const now = new Date();
    if (now.toDateString() !== this.today().toDateString()) {
      this.today.set(now);
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
