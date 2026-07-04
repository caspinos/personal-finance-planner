import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';

import {
  AssetTransactionType,
  NetWorthService,
} from '../../../core/net-worth/net-worth.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-holding-transaction-form',
  imports: [
    ReactiveFormsModule,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
    HlmToggleGroupImports,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>{{ title() }}</h1>
          <p hlmCardDescription>{{ description() }}</p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading transaction...
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>Type</label>
                <hlm-toggle-group
                  type="single"
                  [value]="type()"
                  (valueChange)="onTypeChange($event)"
                >
                  <button hlmToggleGroupItem value="buy" type="button">Buy</button>
                  <button hlmToggleGroupItem value="sell" type="button">Sell</button>
                </hlm-toggle-group>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="quantity">Quantity</label>
                  <input
                    hlmInput
                    id="quantity"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    formControlName="quantity"
                  />
                  @if (form.controls.quantity.invalid && form.controls.quantity.touched) {
                    <hlm-field-error forceShow>Enter a quantity greater than 0.</hlm-field-error>
                  }
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="pricePerUnit">Price per unit</label>
                  <input
                    hlmInput
                    id="pricePerUnit"
                    type="number"
                    min="0"
                    step="0.0001"
                    formControlName="pricePerUnit"
                  />
                  @if (form.controls.pricePerUnit.invalid && form.controls.pricePerUnit.touched) {
                    <hlm-field-error forceShow>Enter a price of 0 or more.</hlm-field-error>
                  }
                </div>
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="fee">Fee (optional)</label>
                  <input hlmInput id="fee" type="number" min="0" step="0.01" formControlName="fee" />
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="occurredOn">Date</label>
                  <input hlmInput id="occurredOn" type="date" formControlName="occurredOn" />
                </div>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="note">Note (optional)</label>
                <input hlmInput id="note" type="text" formControlName="note" />
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>Couldn't record the transaction</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                }
                {{ submitLabel() }}
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class HoldingTransactionForm {
  private readonly netWorth = inject(NetWorthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly holdingId = signal<string>(
    this.route.snapshot.queryParamMap.get('holdingId') ?? '',
  );
  protected readonly type = signal<AssetTransactionType>('buy');
  protected readonly submitting = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly transactionId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.transactionId() !== null);
  protected readonly title = computed(() =>
    this.isEditing() ? 'Edit transaction' : 'Record a transaction',
  );
  protected readonly description = computed(() =>
    this.isEditing()
      ? 'Update a buy or sell event for this holding.'
      : 'Log a buy or sell event for this holding.',
  );
  protected readonly submitLabel = computed(() => {
    if (this.submitting()) {
      return 'Saving...';
    }

    return this.isEditing() ? 'Save changes' : 'Save transaction';
  });

  protected readonly form = this.fb.nonNullable.group({
    quantity: [0, [Validators.required, Validators.min(0.000001)]],
    pricePerUnit: [0, [Validators.required, Validators.min(0)]],
    fee: [0],
    occurredOn: [toDateInputValue(new Date()), Validators.required],
    note: [''],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected onTypeChange(
    value: AssetTransactionType | AssetTransactionType[] | null | undefined,
  ): void {
    if (value === 'buy' || value === 'sell') {
      this.type.set(value);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || !this.holdingId() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { quantity, pricePerUnit, fee, occurredOn, note } = this.form.getRawValue();
      const input = {
        holdingId: this.holdingId(),
        type: this.type(),
        quantity,
        pricePerUnit,
        fee,
        occurredOn: new Date(occurredOn),
        note,
      };

      if (this.transactionId()) {
        await this.netWorth.updateHoldingTransaction(this.transactionId()!, input);
      } else {
        await this.netWorth.recordHoldingTransaction(input);
      }

      await this.router.navigateByUrl(`/net-worth/holdings/${this.holdingId()}`);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadInitialData(): Promise<void> {
    if (!this.transactionId()) {
      if (!this.holdingId()) {
        await this.router.navigateByUrl('/net-worth');
      }
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const transaction = await this.netWorth.loadHoldingTransaction(this.transactionId()!);
      this.holdingId.set(transaction.asset_holding_id);
      this.type.set(transaction.type);
      this.form.patchValue({
        quantity: Number(transaction.quantity),
        pricePerUnit: Number(transaction.price_per_unit),
        fee: Number(transaction.fee),
        occurredOn: transaction.occurred_on,
        note: transaction.note ?? '',
      });
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
