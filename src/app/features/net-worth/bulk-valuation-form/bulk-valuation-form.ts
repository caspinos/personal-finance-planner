import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import {
  AssetAccount,
  AssetAccountType,
  NetWorthService,
} from '../../../core/net-worth/net-worth.service';

type ValuationRowGroup = FormGroup<{
  value: FormControl<number | null>;
  contributionAmount: FormControl<number | null>;
}>;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses a `yyyy-mm-dd` date input value as a local date. `new Date(value)`
 * would read it as UTC midnight, which lands on the previous day in timezones
 * behind UTC and would then be stored under the wrong date.
 */
function parseDateInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function previousDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
}

function createRow(): ValuationRowGroup {
  return new FormGroup({
    value: new FormControl<number | null>(null, [Validators.min(0)]),
    contributionAmount: new FormControl<number | null>(null),
  });
}

@Component({
  selector: 'app-bulk-valuation-form',
  imports: [
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <a hlmBtn variant="ghost" size="sm" class="self-start" routerLink="/net-worth">{{
          'bulkValuationForm.back' | transloco
        }}</a>
        <div>
          <h1 class="text-2xl font-semibold">{{ 'bulkValuationForm.title' | transloco }}</h1>
          <p class="text-muted-foreground text-sm">
            {{ 'bulkValuationForm.description' | transloco }}
          </p>
        </div>
      </div>

      @if (loading()) {
        <div class="text-muted-foreground flex items-center gap-2 text-sm">
          <hlm-spinner />
          {{ 'bulkValuationForm.loading' | transloco }}
        </div>
      } @else if (accounts().length === 0) {
        <div hlmCard class="max-w-md">
          <div hlmCardHeader>
            <h2 hlmCardTitle>{{ 'bulkValuationForm.noAccountsTitle' | transloco }}</h2>
            <p hlmCardDescription>{{ 'bulkValuationForm.noAccountsDescription' | transloco }}</p>
          </div>
          <div hlmCardFooter>
            <a hlmBtn size="sm" routerLink="/net-worth/accounts/new">{{
              'netWorth.createAccount' | transloco
            }}</a>
          </div>
        </div>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-6">
          <div hlmField class="max-w-xs">
            <label hlmFieldLabel for="valuedOn">{{
              'bulkValuationForm.valuedOn' | transloco
            }}</label>
            <input hlmInput id="valuedOn" type="date" formControlName="valuedOn" />
            <hlm-field-description>
              {{ 'bulkValuationForm.valuedOnDescription' | transloco }}
            </hlm-field-description>
            @if (
              form.controls.valuedOn.invalid && (form.controls.valuedOn.touched || submitted())
            ) {
              <hlm-field-error forceShow>{{
                'bulkValuationForm.valuedOnError' | transloco
              }}</hlm-field-error>
            }
          </div>

          @if (prefilling()) {
            <div class="text-muted-foreground flex items-center gap-2 text-sm">
              <hlm-spinner />
              {{ 'bulkValuationForm.loadingDate' | transloco }}
            </div>
          }

          @if (existingCount() > 0) {
            <div hlmAlert>
              <p hlmAlertTitle>{{ 'bulkValuationForm.existingTitle' | transloco }}</p>
              <p hlmAlertDescription>
                {{
                  'bulkValuationForm.existingDescription' | transloco: { count: existingCount() }
                }}
              </p>
            </div>
          }

          <div hlmCard class="overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full min-w-max text-sm">
                <caption class="sr-only">
                  {{
                    'bulkValuationForm.tableCaption' | transloco
                  }}
                </caption>
                <thead>
                  <tr class="border-border border-b">
                    <th scope="col" class="min-w-48 px-3 py-2 text-left font-medium">
                      {{ 'bulkValuationForm.account' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {{ 'bulkValuationForm.previousValue' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {{ 'bulkValuationForm.value' | transloco }}
                    </th>
                    <th scope="col" class="px-3 py-2 text-right font-medium whitespace-nowrap">
                      {{ 'bulkValuationForm.contributionAmount' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (group of groupedAccounts(); track group.type) {
                    <tr class="bg-muted/50">
                      <th scope="colgroup" colspan="4" class="px-3 py-1.5 text-left font-semibold">
                        {{ accountTypeLabel(group.type) }}
                      </th>
                    </tr>
                    @for (account of group.accounts; track account.id) {
                      <tr class="border-border/60 border-b" [formGroup]="rowFor(account.id)">
                        <th scope="row" class="px-3 py-1.5 text-left font-normal">
                          <span class="block">{{ account.name }}</span>
                          <span class="text-muted-foreground text-xs">{{ account.currency }}</span>
                        </th>
                        <td
                          class="text-muted-foreground px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
                        >
                          @let previous = previousValue(account.id);
                          @if (previous === null) {
                            &ndash;
                          } @else {
                            {{ previous | number: '1.2-2' }}
                          }
                        </td>
                        <td class="px-3 py-1.5 text-right">
                          <input
                            hlmInput
                            type="number"
                            min="0"
                            step="0.01"
                            class="w-32 text-right tabular-nums"
                            formControlName="value"
                            [attr.aria-label]="valueLabel(account)"
                          />
                        </td>
                        <td class="px-3 py-1.5 text-right">
                          <input
                            hlmInput
                            type="number"
                            step="0.01"
                            class="w-32 text-right tabular-nums"
                            formControlName="contributionAmount"
                            [attr.aria-label]="contributionLabel(account)"
                          />
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          </div>

          @if (submitted() && filledCount() === 0) {
            <hlm-field-error forceShow>{{
              'bulkValuationForm.noValuesError' | transloco
            }}</hlm-field-error>
          }
          @if (submitted() && hasInvalidValue()) {
            <hlm-field-error forceShow>{{
              'bulkValuationForm.valueError' | transloco
            }}</hlm-field-error>
          }

          <p class="text-muted-foreground text-sm">
            {{
              'bulkValuationForm.filledSummary'
                | transloco: { filled: filledCount(), total: accounts().length }
            }}
          </p>

          @if (errorMessage()) {
            <div hlmAlert variant="destructive">
              <p hlmAlertTitle>{{ 'bulkValuationForm.errorTitle' | transloco }}</p>
              <p hlmAlertDescription>{{ errorMessage() }}</p>
            </div>
          }

          <button hlmBtn type="submit" class="self-start" [disabled]="submitting()">
            @if (submitting()) {
              <hlm-spinner />
              {{ 'common.saving' | transloco }}
            } @else {
              {{ 'bulkValuationForm.submit' | transloco }}
            }
          </button>
        </form>
      }
    </div>
  `,
})
export class BulkValuationForm {
  private readonly netWorth = inject(NetWorthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  protected readonly accounts = this.netWorth.activeAccounts;
  protected readonly loading = signal(true);
  protected readonly prefilling = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly existingCount = signal(0);

  /**
   * Latest value per account strictly before the selected date, shown as a
   * reference column so an unchanged account is easy to fill in.
   */
  private readonly previousValues = signal(new Map<string, number>());

  /** One row group per account id, built once the account list has loaded. */
  private readonly rows = new Map<string, ValuationRowGroup>();

  /** Incremented per prefill so only the newest date's response is applied. */
  private prefillRequest = 0;

  protected readonly form = this.fb.nonNullable.group({
    valuedOn: [toDateInputValue(new Date()), Validators.required],
  });

  protected readonly groupedAccounts = computed(() => {
    const groups = new Map<AssetAccountType, AssetAccount[]>();

    for (const account of this.accounts()) {
      const accountsForType = groups.get(account.type) ?? [];
      accountsForType.push(account);
      groups.set(account.type, accountsForType);
    }

    return Array.from(groups.entries()).map(([type, accounts]) => ({ type, accounts }));
  });

  constructor() {
    void this.loadInitialData();

    this.form.controls.valuedOn.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.prefillForSelectedDate());
  }

  protected rowFor(accountId: string): ValuationRowGroup {
    let row = this.rows.get(accountId);

    if (!row) {
      row = createRow();
      this.rows.set(accountId, row);
    }

    return row;
  }

  protected previousValue(accountId: string): number | null {
    return this.previousValues().get(accountId) ?? null;
  }

  protected accountTypeLabel(type: AssetAccountType): string {
    return this.transloco.translate(`netWorth.accountType.${type}`);
  }

  protected valueLabel(account: AssetAccount): string {
    return this.transloco.translate('bulkValuationForm.valueLabel', {
      account: account.name,
      currency: account.currency,
    });
  }

  protected contributionLabel(account: AssetAccount): string {
    return this.transloco.translate('bulkValuationForm.contributionLabel', {
      account: account.name,
      currency: account.currency,
    });
  }

  protected filledCount(): number {
    return this.filledEntries().length;
  }

  protected hasInvalidValue(): boolean {
    return this.filledEntries().some((entry) => entry.value < 0);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.errorMessage.set(null);

    const entries = this.filledEntries();

    if (
      this.form.invalid ||
      this.submitting() ||
      entries.length === 0 ||
      entries.some((entry) => entry.value < 0)
    ) {
      return;
    }

    const valuedOn = parseDateInputValue(this.form.getRawValue().valuedOn);

    if (!valuedOn) {
      return;
    }

    this.submitting.set(true);

    try {
      await this.netWorth.recordValuations({ valuedOn, entries });

      await this.router.navigateByUrl('/net-worth');
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  /** The rows the user actually filled in — a blank value means "skip this account". */
  private filledEntries(): Array<{
    accountId: string;
    value: number;
    currency: string;
    contributionAmount: number;
  }> {
    const entries: Array<{
      accountId: string;
      value: number;
      currency: string;
      contributionAmount: number;
    }> = [];

    for (const account of this.accounts()) {
      const { value, contributionAmount } = this.rowFor(account.id).getRawValue();

      if (value === null || Number.isNaN(value)) {
        continue;
      }

      entries.push({
        accountId: account.id,
        value,
        currency: account.currency,
        contributionAmount: contributionAmount ?? 0,
      });
    }

    return entries;
  }

  private async loadInitialData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.loadAccounts();

      this.rows.clear();
      for (const account of this.accounts()) {
        this.rows.set(account.id, createRow());
      }

      await this.prefillForSelectedDate();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Fills the grid from whatever is already stored for the selected date and
   * refreshes the reference column with the last value before it, so switching
   * dates always shows the state that saving would overwrite.
   */
  private async prefillForSelectedDate(): Promise<void> {
    const selectedDate = parseDateInputValue(this.form.getRawValue().valuedOn);

    if (!selectedDate) {
      return;
    }

    // Typing in the date field can start several loads; only the newest one
    // may write to the grid, so a slow earlier response can't clobber it.
    const request = ++this.prefillRequest;
    this.prefilling.set(true);

    try {
      const [existing, [previousRows]] = await Promise.all([
        this.netWorth.loadValuationsOn(selectedDate),
        this.netWorth.loadTimeline([previousDay(selectedDate)]),
      ]);

      if (request !== this.prefillRequest) {
        return;
      }

      const previous = new Map<string, number>();
      for (const row of previousRows) {
        if (row.valuation_id !== null) {
          previous.set(row.account_id, row.value);
        }
      }
      this.previousValues.set(previous);

      const existingByAccount = new Map(
        existing.map((valuation) => [valuation.asset_account_id, valuation]),
      );

      for (const account of this.accounts()) {
        const row = this.rowFor(account.id);
        const valuation = existingByAccount.get(account.id);

        row.setValue({
          value: valuation ? Number(valuation.value) : null,
          contributionAmount: valuation ? Number(valuation.contribution_amount) : null,
        });
      }

      this.existingCount.set(
        this.accounts().filter((account) => existingByAccount.has(account.id)).length,
      );
    } catch (error) {
      if (request === this.prefillRequest) {
        this.errorMessage.set(this.extractMessage(error));
      }
    } finally {
      if (request === this.prefillRequest) {
        this.prefilling.set(false);
      }
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
