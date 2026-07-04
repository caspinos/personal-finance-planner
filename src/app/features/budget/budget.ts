import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { BudgetService } from '../../core/budget/budget.service';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

@Component({
  selector: 'app-budget',
  imports: [RouterLink, DecimalPipe, HlmButtonImports, HlmCardImports],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <button
            hlmBtn
            variant="outline"
            size="icon-sm"
            type="button"
            (click)="previousMonth()"
            aria-label="Previous month"
          >
            &lsaquo;
          </button>
          <span class="min-w-40 text-center font-medium">{{ monthLabel() }}</span>
          <button
            hlmBtn
            variant="outline"
            size="icon-sm"
            type="button"
            (click)="nextMonth()"
            aria-label="Next month"
          >
            &rsaquo;
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <a hlmBtn variant="outline" size="sm" routerLink="/budget/transfers/new">Transfer</a>
          <a hlmBtn size="sm" routerLink="/budget/transactions/new">Record transaction</a>
          <a hlmBtn variant="secondary" size="sm" routerLink="/budget/envelopes/new"
            >New envelope</a
          >
        </div>
      </div>

      @if (loading()) {
        <p class="text-muted-foreground text-sm">Loading envelopes&hellip;</p>
      } @else if (envelopes().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>No envelopes yet</h2>
            <p hlmCardDescription>Create your first envelope to start budgeting.</p>
          </div>
        </div>
      } @else {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          @for (envelope of envelopes(); track envelope.id) {
            <div hlmCard>
              <div hlmCardHeader>
                <h2 hlmCardTitle>{{ envelope.name }}</h2>
                <p hlmCardDescription>Balance as of {{ monthLabel() }}</p>
              </div>
              <div hlmCardContent>
                <p
                  class="text-2xl font-semibold"
                  [class.text-destructive]="(balances()[envelope.id] ?? 0) < 0"
                >
                  {{ balances()[envelope.id] ?? 0 | number: '1.2-2' }}
                </p>
              </div>
              <div hlmCardFooter>
                <a
                  hlmBtn
                  variant="outline"
                  size="sm"
                  [routerLink]="['/budget/envelopes', envelope.id]"
                >
                  View history
                </a>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class Budget {
  private readonly budget = inject(BudgetService);

  protected readonly loading = signal(true);
  protected readonly month = signal(startOfMonth(new Date()));
  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly balances = this.budget.balances;

  protected readonly monthLabel = computed(() =>
    this.month().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
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

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    await this.budget.loadEnvelopes();
    await this.loadBalances();
    this.loading.set(false);
  }

  private async loadBalances(): Promise<void> {
    await this.budget.loadBalances(endOfMonth(this.month()));
  }
}
