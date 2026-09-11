import { Component, computed, inject, signal } from '@angular/core';
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
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { BudgetService } from '../../core/budget/budget.service';
import { HouseholdService } from '../../core/household/household.service';
import { LanguageService } from '../../core/i18n/language.service';

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
            <li hlmCard size="sm">
              <div class="flex items-center gap-2 px-3">
                <div class="flex min-w-0 flex-1 flex-col">
                  <div class="flex items-baseline justify-between gap-2">
                    <h2 class="truncate text-sm font-medium" [title]="envelope.name">
                      {{ envelope.name }}
                    </h2>
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

  protected readonly loading = signal(true);
  protected readonly month = signal(startOfMonth(new Date()));
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

  constructor() {
    void this.loadAll();
  }

  protected previousMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    void this.loadBalances();
  }

  protected nextMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    void this.loadBalances();
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
    await this.budget.loadEnvelopes();
    await this.budget.processDueRecurringRules();
    await Promise.all([this.loadBalances(), this.budget.loadRecurringRules()]);
    this.loading.set(false);
  }

  private async loadBalances(): Promise<void> {
    await this.budget.loadBalances(endOfMonth(this.month()));
  }
}
