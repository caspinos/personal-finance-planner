import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { NetWorthService, NetWorthSummaryRow } from '../../core/net-worth/net-worth.service';

@Component({
  selector: 'app-net-worth',
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
        <div>
          <h1 class="text-2xl font-semibold">Net worth</h1>
          <p class="text-muted-foreground text-sm">
            Manual account valuations as of {{ asOfLabel() }}.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <a hlmBtn variant="outline" size="sm" routerLink="/net-worth/valuations/new">
            Add valuation
          </a>
          <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">New account</a>
        </div>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Couldn't load net worth</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Total net worth</h2>
          <p hlmCardDescription>Liabilities are subtracted from the total.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading net worth...
            </div>
          } @else {
            <p
              class="text-3xl font-semibold"
              [class.text-destructive]="netWorth.totalNetWorth() < 0"
            >
              {{ netWorth.totalNetWorth() | number: '1.2-2' }}
            </p>
          }
        </div>
      </div>

      @if (!loading() && rows().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>No asset accounts yet</h2>
            <p hlmCardDescription>Create an account, then add a manual valuation snapshot.</p>
          </div>
          <div hlmCardFooter>
            <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">Create account</a>
          </div>
        </div>
      } @else if (!loading()) {
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          @for (row of rows(); track row.account_id) {
            <div hlmCard>
              <div hlmCardHeader>
                <h2 hlmCardTitle>{{ row.account_name }}</h2>
                <p hlmCardDescription>{{ accountTypeLabel(row.account_type) }}</p>
              </div>
              <div hlmCardContent class="flex flex-col gap-2">
                <p
                  class="text-2xl font-semibold"
                  [class.text-destructive]="row.signed_value < 0"
                >
                  {{ row.signed_value | number: '1.2-2' }} {{ row.currency }}
                </p>
                <p class="text-muted-foreground text-sm">
                  @if (row.valued_on) {
                    Valued {{ row.valued_on | date: 'mediumDate' }}
                  } @else {
                    No valuation recorded yet
                  }
                </p>
              </div>
              <div hlmCardFooter>
                <a
                  hlmBtn
                  variant="outline"
                  size="sm"
                  routerLink="/net-worth/valuations/new"
                  [queryParams]="{ accountId: row.account_id }"
                >
                  Add valuation
                </a>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class NetWorth {
  protected readonly netWorth = inject(NetWorthService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly asOf = signal(new Date());
  protected readonly rows = this.netWorth.summary;
  protected readonly asOfLabel = computed(() =>
    this.asOf().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  );

  constructor() {
    void this.loadAll();
  }

  protected accountTypeLabel(type: NetWorthSummaryRow['account_type']): string {
    return type
      .split('_')
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.loadAccounts();
      await this.netWorth.loadSummary(this.asOf());
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
