import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { BudgetService, GlobalEvent } from '../../../core/budget/budget.service';
import { LanguageService } from '../../../core/i18n/language.service';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

@Component({
  selector: 'app-history',
  imports: [
    DatePipe,
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
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget">{{
            'history.backToBudget' | transloco
          }}</a>
          <div>
            <h1 class="text-2xl font-semibold">{{ 'history.title' | transloco }}</h1>
            <p class="text-muted-foreground text-sm">
              {{ 'history.subtitle' | transloco: { month: monthLabel() } }}
            </p>
          </div>
        </div>

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
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>{{ 'history.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>{{ 'history.allOperationsTitle' | transloco }}</h2>
          <p hlmCardDescription>{{ 'history.allOperationsDescription' | transloco }}</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'history.loading' | transloco }}
            </div>
          } @else if (events().length === 0) {
            <p class="text-muted-foreground text-sm">{{ 'history.noActivity' | transloco }}</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (event of events(); track event.kind + event.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">{{ eventTitle(event) }}</span>
                      <span class="text-muted-foreground text-sm">
                        {{ event.occurred_on | date: 'mediumDate' }}
                      </span>
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ eventEnvelopes(event) }}
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      class="min-w-28 text-right font-medium"
                      [class.text-destructive]="signedAmount(event) < 0"
                    >
                      {{ signedAmount(event) | number: '1.2-2' }} {{ event.currency }}
                    </span>
                    <a hlmBtn variant="outline" size="sm" [routerLink]="editLink(event)">
                      {{ 'common.edit' | transloco }}
                    </a>
                    <button
                      hlmBtn
                      variant="destructive"
                      size="sm"
                      type="button"
                      [disabled]="deletingKey() === event.kind + event.id"
                      (click)="deleteEvent(event)"
                    >
                      @if (deletingKey() === event.kind + event.id) {
                        <hlm-spinner />
                      }
                      {{ 'common.delete' | transloco }}
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
export class History {
  private readonly budget = inject(BudgetService);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);

  protected readonly events = signal<GlobalEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly deletingKey = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly month = signal(startOfMonth(new Date()));

  protected readonly monthLabel = computed(() =>
    this.month().toLocaleDateString(this.language.localeTag(), { month: 'long', year: 'numeric' }),
  );

  constructor() {
    void this.loadMonth();
  }

  protected previousMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    void this.loadMonth();
  }

  protected nextMonth(): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    void this.loadMonth();
  }

  protected eventTitle(event: GlobalEvent): string {
    if (event.kind === 'transaction') {
      return event.name;
    }

    return event.description || this.transloco.translate('history.defaultTransfer');
  }

  protected eventEnvelopes(event: GlobalEvent): string {
    if (event.kind === 'transaction') {
      const kind = this.transloco.translate(
        event.transaction_type === 'income' ? 'history.topUp' : 'history.expense',
      );
      return `${kind} · ${event.envelope_name}`;
    }

    const transfer = this.transloco.translate('history.transfer');
    return `${transfer} · ${event.from_envelope_name} → ${event.to_envelope_name}`;
  }

  protected signedAmount(event: GlobalEvent): number {
    if (event.kind === 'transaction') {
      return event.transaction_type === 'income' ? event.amount : -event.amount;
    }

    return event.amount;
  }

  protected editLink(event: GlobalEvent): string {
    return event.kind === 'transaction'
      ? `/budget/transactions/${event.id}/edit`
      : `/budget/transfers/${event.id}/edit`;
  }

  protected async deleteEvent(event: GlobalEvent): Promise<void> {
    const confirmed = window.confirm(
      this.transloco.translate('history.deleteConfirm', { kind: event.kind }),
    );
    if (!confirmed) {
      return;
    }

    const key = event.kind + event.id;
    this.deletingKey.set(key);
    this.errorMessage.set(null);

    try {
      if (event.kind === 'transaction') {
        await this.budget.deleteTransaction(event.id);
      } else {
        await this.budget.deleteTransfer(event.id);
      }

      await this.loadMonth();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.deletingKey.set(null);
    }
  }

  private async loadMonth(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.budget.loadEnvelopes();
      const events = await this.budget.loadAllEvents({
        from: startOfMonth(this.month()),
        to: endOfMonth(this.month()),
      });
      this.events.set(events);
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
