import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { AssetAccount, AssetValuation, HoldingPosition, NetWorthService } from '../../../core/net-worth/net-worth.service';

@Component({
  selector: 'app-account-history',
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
          <a hlmBtn variant="ghost" size="sm" routerLink="/net-worth">Back to net worth</a>
          <div>
            <h1 class="text-2xl font-semibold">{{ account()?.name ?? 'Account history' }}</h1>
            <p class="text-muted-foreground text-sm">
              @if (account(); as account) {
                {{ accountTypeLabel(account.type) }} &middot; {{ account.currency }}
                @if (account.archived) {
                  &middot; Archived
                }
              }
            </p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          @if (account(); as account) {
            <button
              hlmBtn
              variant="outline"
              size="sm"
              type="button"
              [disabled]="archiving()"
              (click)="toggleArchived(account)"
            >
              @if (archiving()) {
                <hlm-spinner />
              }
              {{ account.archived ? 'Unarchive account' : 'Archive account' }}
            </button>
          }
          <a
            hlmBtn
            size="sm"
            routerLink="/net-worth/valuations/new"
            [queryParams]="{ accountId: accountId() }"
          >
            Add valuation
          </a>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load account history</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Valuations</h2>
          <p hlmCardDescription>Every dated snapshot recorded for this account.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading valuations...
            </div>
          } @else if (valuations().length === 0) {
            <p class="text-muted-foreground text-sm">No valuations recorded yet.</p>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (valuation of valuations(); track valuation.id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col gap-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium">
                        {{ valuation.value | number: '1.2-2' }} {{ valuation.currency }}
                      </span>
                      <span class="text-muted-foreground text-sm">
                        {{ valuation.valued_on | date: 'mediumDate' }}
                      </span>
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ valuation.note || 'No note' }}
                      @if (valuation.contribution_amount) {
                        &middot; Contribution {{ valuation.contribution_amount | number: '1.2-2' }}
                      }
                    </p>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      [routerLink]="['/net-worth/valuations', valuation.id, 'edit']"
                    >
                      Edit
                    </a>
                    <button
                      hlmBtn
                      variant="destructive"
                      size="sm"
                      type="button"
                      [disabled]="deletingId() === valuation.id"
                      (click)="deleteValuation(valuation)"
                    >
                      @if (deletingId() === valuation.id) {
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

      @if (account()?.type === 'investment') {
        <div hlmCard>
          <div hlmCardHeader class="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <h2 hlmCardTitle>Holdings</h2>
              <p hlmCardDescription>Individual stocks, ETFs, or funds held in this account.</p>
            </div>
            <a
              hlmBtn
              variant="outline"
              size="sm"
              routerLink="/net-worth/holdings/new"
              [queryParams]="{ accountId: accountId() }"
            >
              New holding
            </a>
          </div>
          <div hlmCardContent>
            @if (loading()) {
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <hlm-spinner />
                Loading holdings...
              </div>
            } @else if (holdings().length === 0) {
              <p class="text-muted-foreground text-sm">No holdings recorded yet.</p>
            } @else {
              <ul class="flex flex-col gap-3">
                @for (holding of holdings(); track holding.id) {
                  <li
                    class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div class="flex min-w-0 flex-col gap-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-medium">{{ holding.name }}</span>
                        @if (holding.ticker) {
                          <span class="text-muted-foreground text-sm">{{ holding.ticker }}</span>
                        }
                      </div>
                      @if (positionFor(holding.id); as position) {
                        <p class="text-muted-foreground text-sm">
                          {{ position.quantity | number: '1.0-6' }} units &middot; market value
                          {{ position.market_value | number: '1.2-2' }} {{ holding.currency }}
                        </p>
                      } @else {
                        <p class="text-muted-foreground text-sm">No transactions recorded yet.</p>
                      }
                    </div>

                    <a
                      hlmBtn
                      variant="outline"
                      size="sm"
                      [routerLink]="['/net-worth/holdings', holding.id]"
                    >
                      View history
                    </a>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class AccountHistory {
  private readonly netWorth = inject(NetWorthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly account = signal<AssetAccount | null>(null);
  protected readonly valuations = signal<AssetValuation[]>([]);
  protected readonly holdings = this.netWorth.holdings;
  protected readonly positions = signal<HoldingPosition[]>([]);
  protected readonly loading = signal(true);
  protected readonly archiving = signal(false);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly accountId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  constructor() {
    void this.loadAll();
  }

  protected accountTypeLabel(type: AssetAccount['type']): string {
    return type
      .split('_')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected positionFor(holdingId: string): HoldingPosition | undefined {
    return this.positions().find((position) => position.holding_id === holdingId);
  }

  protected async toggleArchived(account: AssetAccount): Promise<void> {
    this.archiving.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.setAccountArchived(account.id, !account.archived);
      this.account.set({ ...account, archived: !account.archived });
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.archiving.set(false);
    }
  }

  protected async deleteValuation(valuation: AssetValuation): Promise<void> {
    const confirmed = window.confirm('Delete this valuation? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    this.deletingId.set(valuation.id);
    this.errorMessage.set(null);

    try {
      await this.netWorth.deleteValuation(valuation.id);
      await this.loadValuations();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.deletingId.set(null);
    }
  }

  private async loadAll(): Promise<void> {
    const accountId = this.accountId();
    if (!accountId) {
      await this.router.navigateByUrl('/net-worth');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const account = await this.netWorth.loadAccount(accountId);
      this.account.set(account);
      await this.loadValuations();

      if (account.type === 'investment') {
        await this.loadHoldings();
      }
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadValuations(): Promise<void> {
    const valuations = await this.netWorth.loadValuations(this.accountId());
    this.valuations.set(valuations);
  }

  private async loadHoldings(): Promise<void> {
    await this.netWorth.loadHoldings(this.accountId());
    const positions = await this.netWorth.loadPositions(new Date());
    this.positions.set(positions);
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
