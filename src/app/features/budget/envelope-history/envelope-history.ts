import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { BudgetService, Envelope, EnvelopeEvent } from '../../../core/budget/budget.service';
import { HouseholdService } from '../../../core/household/household.service';
import { LanguageService } from '../../../core/i18n/language.service';

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
    TranslocoModule,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-col gap-2">
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget">{{
            'envelopeHistory.backToBudget' | transloco
          }}</a>
          <div>
            <h1 class="text-2xl font-semibold">
              {{ envelope()?.name ?? ('envelopeHistory.defaultTitle' | transloco) }}
            </h1>
            <p class="text-muted-foreground text-sm">
              {{ 'envelopeHistory.subtitle' | transloco: { month: monthLabel() } }}
              @if (envelope()?.archived) {
                &middot; {{ 'envelopeHistory.archived' | transloco }}
              }
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          @if (envelope(); as envelope) {
            <a
              hlmBtn
              variant="outline"
              size="sm"
              [routerLink]="['/budget/envelopes', envelope.id, 'edit']"
            >
              {{ 'budget.rename' | transloco }}
            </a>
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
              {{
                (envelope.archived
                  ? 'envelopeHistory.unarchiveEnvelope'
                  : 'envelopeHistory.archiveEnvelope'
                ) | transloco
              }}
            </button>
            @if (isOwner()) {
              <a
                hlmBtn
                variant="destructive"
                size="sm"
                [routerLink]="['/budget/envelopes', envelope.id, 'delete']"
              >
                {{ 'envelopeHistory.deleteEnvelope' | transloco }}
              </a>
            }
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
          <p hlmAlertTitle>{{ 'envelopeHistory.loadErrorTitle' | transloco }}</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>{{ 'envelopeHistory.balanceTitle' | transloco }}</h2>
          <p hlmCardDescription>
            {{ 'envelopeHistory.balanceSubtitle' | transloco: { month: monthLabel() } }}
          </p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'envelopeHistory.loadingHistory' | transloco }}
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
          <h2 hlmCardTitle>{{ 'envelopeHistory.activityTitle' | transloco }}</h2>
          <p hlmCardDescription>{{ 'envelopeHistory.activityDescription' | transloco }}</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'envelopeHistory.loadingActivity' | transloco }}
            </div>
          } @else if (events().length === 0) {
            <p class="text-muted-foreground text-sm">
              {{ 'envelopeHistory.noActivity' | transloco }}
            </p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (event of events(); track event.kind + event.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">{{ eventTitle(event) }}</span>
                      @if (eventBadge(event); as badge) {
                        <span
                          class="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
                        >
                          {{ badge }}
                        </span>
                      }
                      <span class="text-muted-foreground text-sm">
                        {{ event.occurred_on | date: 'mediumDate' }}
                      </span>
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ eventDescription(event) }}
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <span
                      class="min-w-28 text-right font-medium"
                      [class.text-destructive]="isNegative(event)"
                    >
                      {{ displayAmount(event) | number: '1.2-2' }} {{ event.currency }}
                    </span>
                    <a hlmBtn variant="outline" size="sm" [routerLink]="editLink(event)">
                      {{ 'common.edit' | transloco }}
                    </a>
                    @if (event.kind !== 'amortized_charge') {
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
                    }
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
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly households = inject(HouseholdService);

  // Deleting an envelope is owner-only (enforced by RLS on the delete). Hide the
  // entry point from editors/viewers so they aren't sent into a flow that fails.
  protected readonly isOwner = computed(() => this.households.currentRole() === 'owner');

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
    this.month().toLocaleDateString(this.language.localeTag(), { month: 'long', year: 'numeric' }),
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
    if (event.kind === 'amortized_charge') {
      return this.transloco.translate('envelopeHistory.amortizedCharge');
    }

    if (event.kind === 'transaction') {
      return this.transloco.translate(
        event.transaction_type === 'income' ? 'envelopeHistory.income' : 'envelopeHistory.expense',
      );
    }

    return this.transloco.translate(
      event.direction === 'in' ? 'envelopeHistory.transferFrom' : 'envelopeHistory.transferTo',
      { name: event.other_envelope_name },
    );
  }

  protected eventBadge(event: EnvelopeEvent): string | null {
    if (event.kind === 'amortized_charge') {
      return this.transloco.translate('envelopeHistory.amortizedChargeBadge');
    }

    if (event.kind === 'transaction' && event.amortized_months !== null) {
      return this.transloco.translate('envelopeHistory.amortizedPaymentBadge', {
        months: event.amortized_months,
      });
    }

    return null;
  }

  protected eventDescription(event: EnvelopeEvent): string {
    if (event.kind === 'amortized_charge') {
      return event.name;
    }

    if (event.kind === 'transaction') {
      // An amortized payment doesn't reduce this envelope's budget directly;
      // the monthly slices do. Make that explicit in the history row.
      if (event.amortized_months !== null) {
        return this.transloco.translate('envelopeHistory.amortizedPaymentNote', {
          name: event.name,
        });
      }
      return event.name;
    }

    return (
      event.description ??
      this.transloco.translate(
        event.direction === 'in'
          ? 'envelopeHistory.incomingTransfer'
          : 'envelopeHistory.outgoingTransfer',
      )
    );
  }

  /** Signed amount actually shown on the row. */
  protected displayAmount(event: EnvelopeEvent): number {
    if (event.kind === 'amortized_charge') {
      return -event.amount;
    }

    if (event.kind === 'transaction') {
      // Budget-neutral: shown as the full paid amount without a sign, since the
      // slices (not the payment) move the balance.
      if (event.amortized_months !== null) {
        return event.amount;
      }
      return event.transaction_type === 'income' ? event.amount : -event.amount;
    }

    return event.direction === 'in' ? event.amount : -event.amount;
  }

  /** Whether the amount should read as a budget outflow (destructive styling). */
  protected isNegative(event: EnvelopeEvent): boolean {
    if (event.kind === 'transaction' && event.amortized_months !== null) {
      return false;
    }
    return this.displayAmount(event) < 0;
  }

  protected editLink(event: EnvelopeEvent): string {
    if (event.kind === 'amortized_charge') {
      return `/budget/transactions/${event.source_transaction_id}/edit`;
    }

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
    // Amortization slices are derived, not stored: edit/delete the source
    // transaction instead. The delete control is hidden for them anyway.
    if (event.kind === 'amortized_charge') {
      return;
    }

    const confirmed = window.confirm(
      this.transloco.translate('envelopeHistory.deleteConfirm', { kind: event.kind }),
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

  private async loadAll(): Promise<void> {
    const envelopeId = this.envelopeId();
    if (!envelopeId) {
      await this.router.navigateByUrl('/budget');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      // Populates currentRole() so the owner-only delete action can be gated.
      // Non-fatal: if it fails, the role stays null and the delete link is simply
      // hidden, which is the safe default -- it must not break the history view.
      void this.households.loadMembers().catch(() => undefined);

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
