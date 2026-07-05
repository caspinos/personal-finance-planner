import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { BudgetService, Envelope, EnvelopeEvent } from '../../../core/budget/budget.service';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

@Component({
  selector: 'app-envelope-history',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSpinnerImports,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-col gap-2">
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget">Back to budget</a>
          <div>
            <h1 class="text-2xl font-semibold">{{ envelope()?.name ?? 'Envelope history' }}</h1>
            <p class="text-muted-foreground text-sm">
              Transactions and transfers recorded in {{ monthLabel() }}.
              @if (envelope()?.archived) {
                &middot; Archived
              }
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (envelope(); as envelope) {
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              [disabled]="archiving()"
              (click)="toggleArchived(envelope)"
            >
              @if (archiving()) {
                <hlm-spinner />
              }
              {{ envelope.archived ? 'Unarchive envelope' : 'Archive envelope' }}
            </button>
          }
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
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load envelope history</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Balance</h2>
          <p hlmCardDescription>As of the end of {{ monthLabel() }}</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading history...
            </div>
          } @else {
            <p class="text-3xl font-semibold" [class.text-destructive]="currentBalance() < 0">
              {{ currentBalance() | number: '1.2-2' }}
            </p>
          }
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Activity</h2>
          <p hlmCardDescription>Events that changed this envelope during the selected month.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading activity...
            </div>
          } @else if (events().length === 0) {
            <p class="text-muted-foreground text-sm">No activity recorded for this month.</p>
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
                      {{ event.description || eventDescription(event) }}
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      class="min-w-28 text-right font-medium"
                      [class.text-destructive]="signedAmount(event) < 0"
                    >
                      {{ signedAmount(event) | number: '1.2-2' }} {{ event.currency }}
                    </span>
                    <a hlmBtn variant="outline" size="sm" [routerLink]="editLink(event)"> Edit </a>
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
                      Delete
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
export class EnvelopeHistory {
  private readonly budget = inject(BudgetService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly envelope = signal<Envelope | null>(null);
  protected readonly events = signal<EnvelopeEvent[]>([]);
  protected readonly loading = signal(true);
  protected readonly archiving = signal(false);
  protected readonly deletingKey = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly month = signal(startOfMonth(new Date()));
  protected readonly balances = this.budget.balances;

  protected readonly envelopeId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');
  protected readonly monthLabel = computed(() =>
    this.month().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  );
  protected readonly currentBalance = computed(() => {
    const envelopeId = this.envelopeId();
    return this.balances()[envelopeId]?.balance ?? 0;
  });

  constructor() {
    void this.loadAll();
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

  protected eventTitle(event: EnvelopeEvent): string {
    if (event.kind === 'transaction') {
      return event.transaction_type === 'income' ? 'Income' : 'Expense';
    }

    return event.direction === 'in'
      ? `Transfer from ${event.other_envelope_name}`
      : `Transfer to ${event.other_envelope_name}`;
  }

  protected eventDescription(event: EnvelopeEvent): string {
    if (event.kind === 'transaction') {
      return event.transaction_type === 'income' ? 'Envelope top-up' : 'Envelope expense';
    }

    return event.direction === 'in' ? 'Incoming envelope transfer' : 'Outgoing envelope transfer';
  }

  protected signedAmount(event: EnvelopeEvent): number {
    if (event.kind === 'transaction') {
      return event.transaction_type === 'income' ? event.amount : -event.amount;
    }

    return event.direction === 'in' ? event.amount : -event.amount;
  }

  protected editLink(event: EnvelopeEvent): string {
    return event.kind === 'transaction'
      ? `/budget/transactions/${event.id}/edit`
      : `/budget/transfers/${event.id}/edit`;
  }

  protected async toggleArchived(envelope: Envelope): Promise<void> {
    this.archiving.set(true);
    this.errorMessage.set(null);

    try {
      await this.budget.setEnvelopeArchived(envelope.id, !envelope.archived);
      this.envelope.set({ ...envelope, archived: !envelope.archived });
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.archiving.set(false);
    }
  }

  protected async deleteEvent(event: EnvelopeEvent): Promise<void> {
    const confirmed = window.confirm(`Delete this ${event.kind}? This cannot be undone.`);
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

  private async loadAll(): Promise<void> {
    const envelopeId = this.envelopeId();
    if (!envelopeId) {
      await this.router.navigateByUrl('/budget');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const [envelope] = await Promise.all([
        this.budget.loadEnvelope(envelopeId),
        this.budget.loadEnvelopes(),
      ]);
      this.envelope.set(envelope);
      await this.loadMonth();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMonth(): Promise<void> {
    const envelopeId = this.envelopeId();
    await Promise.all([
      this.budget.loadBalances(endOfMonth(this.month())),
      this.budget
        .loadEnvelopeEvents({
          envelopeId,
          from: startOfMonth(this.month()),
          to: endOfMonth(this.month()),
        })
        .then((events) => this.events.set(events)),
    ]);
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
