import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import {
  AssetHolding,
  AssetTransaction,
  HoldingPosition,
  NetWorthService,
} from '../../../core/net-worth/net-worth.service';

@Component({
  selector: 'app-holding-history',
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
          @if (holding(); as holding) {
            <a hlmBtn variant="ghost" size="sm" [routerLink]="['/net-worth/accounts', holding.asset_account_id]">
              Back to account
            </a>
          }
          <div>
            <h1 class="text-2xl font-semibold">{{ holding()?.name ?? 'Holding history' }}</h1>
            <p class="text-muted-foreground text-sm">
              @if (holding(); as holding) {
                {{ holding.ticker || 'No ticker' }} &middot; {{ holding.currency }}
              }
            </p>
          </div>
        </div>

        <a
          hlmBtn
          size="sm"
          routerLink="/net-worth/holdings/transactions/new"
          [queryParams]="{ holdingId: holdingId() }"
        >
          Record transaction
        </a>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load holding history</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Position</h2>
          <p hlmCardDescription>Derived from all buy/sell transactions to date.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading position...
            </div>
          } @else if (position(); as position) {
            <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <div>
                <p class="text-muted-foreground text-sm">Quantity</p>
                <p class="text-xl font-semibold">{{ position.quantity | number: '1.0-6' }}</p>
              </div>
              <div>
                <p class="text-muted-foreground text-sm">Average cost</p>
                <p class="text-xl font-semibold">
                  {{ position.average_cost | number: '1.2-4' }} {{ holding()?.currency }}
                </p>
              </div>
              <div>
                <p class="text-muted-foreground text-sm">Market value</p>
                <p class="text-xl font-semibold">
                  {{ position.market_value | number: '1.2-2' }} {{ holding()?.currency }}
                </p>
              </div>
              <div>
                <p class="text-muted-foreground text-sm">Unrealized gain</p>
                <p
                  class="text-xl font-semibold"
                  [class.text-destructive]="position.unrealized_gain < 0"
                >
                  {{ position.unrealized_gain | number: '1.2-2' }} {{ holding()?.currency }}
                </p>
              </div>
            </div>
          } @else {
            <p class="text-muted-foreground text-sm">No transactions recorded yet.</p>
          }
        </div>
      </div>

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Transactions</h2>
          <p hlmCardDescription>Every buy/sell event recorded for this holding.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading transactions...
            </div>
          } @else if (transactions().length === 0) {
            <p class="text-muted-foreground text-sm">No transactions recorded yet.</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (transaction of transactions(); track transaction.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">
                        {{ transaction.type === 'buy' ? 'Buy' : 'Sell' }}
                        {{ transaction.quantity | number: '1.0-6' }} @
                        {{ transaction.price_per_unit | number: '1.2-4' }}
                      </span>
                      <span class="text-muted-foreground text-sm">
                        {{ transaction.occurred_on | date: 'mediumDate' }}
                      </span>
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ transaction.note || 'No note' }}
                      @if (transaction.fee) {
                        &middot; Fee {{ transaction.fee | number: '1.2-2' }}
                      }
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      [routerLink]="['/net-worth/holdings/transactions', transaction.id, 'edit']"
                    >
                      Edit
                    </a>
                    <button
                      hlmBtn
                      variant="destructive"
                      size="sm"
                      type="button"
                      [disabled]="deletingId() === transaction.id"
                      (click)="deleteTransaction(transaction)"
                    >
                      @if (deletingId() === transaction.id) {
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
export class HoldingHistory {
  private readonly netWorth = inject(NetWorthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly holding = signal<AssetHolding | null>(null);
  protected readonly transactions = signal<AssetTransaction[]>([]);
  protected readonly position = signal<HoldingPosition | null>(null);
  protected readonly loading = signal(true);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly holdingId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  constructor() {
    void this.loadAll();
  }

  protected async deleteTransaction(transaction: AssetTransaction): Promise<void> {
    const confirmed = window.confirm('Delete this transaction? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.deletingId.set(transaction.id);
    this.errorMessage.set(null);

    try {
      await this.netWorth.deleteHoldingTransaction(transaction.id);
      await this.loadDetails();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.deletingId.set(null);
    }
  }

  private async loadAll(): Promise<void> {
    const holdingId = this.holdingId();
    if (!holdingId) {
      await this.router.navigateByUrl('/net-worth');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const holding = await this.netWorth.loadHolding(holdingId);
      this.holding.set(holding);
      await this.loadDetails();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDetails(): Promise<void> {
    const holdingId = this.holdingId();
    const [transactions, positions] = await Promise.all([
      this.netWorth.loadHoldingTransactions(holdingId),
      this.netWorth.loadPositions(new Date()),
    ]);
    this.transactions.set(transactions);
    this.position.set(positions.find((position) => position.holding_id === holdingId) ?? null);
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
