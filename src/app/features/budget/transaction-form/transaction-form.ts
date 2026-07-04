import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';

import { BudgetService, BudgetTransactionType } from '../../../core/budget/budget.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-transaction-form',
  imports: [
    ReactiveFormsModule,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmSelectImports,
    HlmToggleGroupImports,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>Record a transaction</h1>
          <p hlmCardDescription>Log an expense or a top-up for one of your envelopes.</p>
        </div>

        <div hlmCardContent>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel>Type</label>
              <hlm-toggle-group
                type="single"
                [value]="type()"
                (valueChange)="onTypeChange($event)"
              >
                <button hlmToggleGroupItem value="expense" type="button">Expense</button>
                <button hlmToggleGroupItem value="income" type="button">Income</button>
              </hlm-toggle-group>
            </div>

            <div hlmField>
              <label hlmFieldLabel>Envelope</label>
              <hlm-select
                [value]="envelopeId()"
                (valueChange)="envelopeId.set($event ?? undefined)"
                [itemToString]="envelopeToString"
              >
                <hlm-select-trigger class="w-full">
                  <hlm-select-value placeholder="Choose an envelope" />
                </hlm-select-trigger>
                <hlm-select-content *hlmSelectPortal>
                  @for (envelope of envelopes(); track envelope.id) {
                    <hlm-select-item [value]="envelope.id">{{ envelope.name }}</hlm-select-item>
                  }
                </hlm-select-content>
              </hlm-select>
              @if (submitted() && !envelopeId()) {
                <hlm-field-error forceShow>Choose an envelope.</hlm-field-error>
              }
            </div>

            <div hlmField>
              <label hlmFieldLabel for="amount">Amount</label>
              <input
                hlmInput
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                formControlName="amount"
              />
              @if (form.controls.amount.invalid && form.controls.amount.touched) {
                <hlm-field-error forceShow>Enter an amount greater than 0.</hlm-field-error>
              }
            </div>

            <div hlmField>
              <label hlmFieldLabel for="occurredOn">Date</label>
              <input hlmInput id="occurredOn" type="date" formControlName="occurredOn" />
            </div>

            <div hlmField>
              <label hlmFieldLabel for="description">Description (optional)</label>
              <input hlmInput id="description" type="text" formControlName="description" />
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
              {{ submitting() ? 'Saving\u2026' : 'Save transaction' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class TransactionForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly type = signal<BudgetTransactionType>('expense');
  protected readonly envelopeId = signal<string | undefined>(undefined);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly envelopeToString = (id: string): string =>
    this.envelopes().find((envelope) => envelope.id === id)?.name ?? '';

  protected readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    occurredOn: [toDateInputValue(new Date()), Validators.required],
    description: [''],
  });

  constructor() {
    if (this.envelopes().length === 0) {
      void this.budget.loadEnvelopes();
    }
  }

  protected onTypeChange(value: BudgetTransactionType | BudgetTransactionType[] | null | undefined): void {
    if (value === 'expense' || value === 'income') {
      this.type.set(value);
    }
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);

    if (this.form.invalid || !this.envelopeId() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { amount, occurredOn, description } = this.form.getRawValue();
      await this.budget.recordTransaction({
        envelopeId: this.envelopeId()!,
        type: this.type(),
        amount,
        occurredOn: new Date(occurredOn),
        description,
      });
      await this.router.navigateByUrl('/budget');
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.submitting.set(false);
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
