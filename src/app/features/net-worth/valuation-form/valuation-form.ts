import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { NetWorthService } from '../../../core/net-worth/net-worth.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-valuation-form',
  imports: [
    ReactiveFormsModule,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSpinnerImports,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-lg">
        <div hlmCardHeader>
          <h1 hlmCardTitle>{{ title() }}</h1>
          <p hlmCardDescription>{{ description() }}</p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading accounts...
            </div>
          } @else if (accounts().length === 0) {
            <div hlmAlert>
              <p hlmAlertTitle>No asset accounts yet</p>
              <p hlmAlertDescription>Create an account first, then add a valuation.</p>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>Account</label>
                <hlm-select
                  [value]="accountId()"
                  (valueChange)="onAccountChange($event)"
                  [itemToString]="accountToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value placeholder="Choose an account" />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (account of accounts(); track account.id) {
                      <hlm-select-item [value]="account.id">{{ account.name }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
                @if (submitted() && !accountId()) {
                  <hlm-field-error forceShow>Choose an account.</hlm-field-error>
                }
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="value">Value ({{ currency() }})</label>
                  <input
                    hlmInput
                    id="value"
                    type="number"
                    min="0"
                    step="0.01"
                    formControlName="value"
                  />
                  @if (form.controls.value.invalid && form.controls.value.touched) {
                    <hlm-field-error forceShow>Enter a value of 0 or more.</hlm-field-error>
                  }
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="valuedOn">Valued on</label>
                  <input hlmInput id="valuedOn" type="date" formControlName="valuedOn" />
                </div>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="contributionAmount">
                  Contribution since last valuation (optional)
                </label>
                <input
                  hlmInput
                  id="contributionAmount"
                  type="number"
                  step="0.01"
                  formControlName="contributionAmount"
                />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="note">Note (optional)</label>
                <input hlmInput id="note" type="text" formControlName="note" />
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>Couldn't save the valuation</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                }
                {{ submitting() ? 'Saving...' : submitLabel() }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class ValuationForm {
  private readonly netWorth = inject(NetWorthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly accounts = this.netWorth.activeAccounts;
  protected readonly accountId = signal<string | undefined>(
    this.route.snapshot.queryParamMap.get('accountId') ?? undefined,
  );
  protected readonly currency = computed(
    () => this.accounts().find((account) => account.id === this.accountId())?.currency ?? '',
  );
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly valuationId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.valuationId() !== null);
  protected readonly title = computed(() => (this.isEditing() ? 'Edit valuation' : 'Add valuation'));
  protected readonly description = computed(() =>
    this.isEditing()
      ? "Update this dated snapshot of an account's value."
      : "Record a dated snapshot of an account's value to update net worth.",
  );
  protected readonly submitLabel = computed(() =>
    this.isEditing() ? 'Save changes' : 'Save valuation',
  );

  protected readonly accountToString = (id: string): string =>
    this.accounts().find((account) => account.id === id)?.name ?? '';

  protected readonly form = this.fb.nonNullable.group({
    value: [0, [Validators.required, Validators.min(0)]],
    valuedOn: [toDateInputValue(new Date()), Validators.required],
    contributionAmount: [0],
    note: [''],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected onAccountChange(value: string | string[] | null | undefined): void {
    if (typeof value === 'string') {
      this.accountId.set(value);
    }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);

    if (this.form.invalid || !this.accountId() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { value, valuedOn, contributionAmount, note } = this.form.getRawValue();
      const input = {
        accountId: this.accountId()!,
        valuedOn: new Date(valuedOn),
        value,
        currency: this.currency(),
        contributionAmount,
        note,
      };

      if (this.valuationId()) {
        await this.netWorth.updateValuation(this.valuationId()!, input);
      } else {
        await this.netWorth.recordValuation(input);
      }

      await this.router.navigateByUrl(`/net-worth/accounts/${this.accountId()}`);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadInitialData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.netWorth.loadAccounts();

      if (this.valuationId()) {
        const valuation = await this.netWorth.loadValuation(this.valuationId()!);
        this.accountId.set(valuation.asset_account_id);
        this.form.patchValue({
          value: Number(valuation.value),
          valuedOn: valuation.valued_on,
          contributionAmount: Number(valuation.contribution_amount),
          note: valuation.note ?? '',
        });
      }
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
