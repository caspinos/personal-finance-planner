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

import { BudgetService } from '../../../core/budget/budget.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-transfer-form',
  imports: [
    ReactiveFormsModule,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmSelectImports,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>Transfer between envelopes</h1>
          <p hlmCardDescription>Move funds from one envelope to another.</p>
        </div>

        <div hlmCardContent>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel>From envelope</label>
              <hlm-select
                [value]="fromEnvelopeId()"
                (valueChange)="fromEnvelopeId.set($event ?? undefined)"
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
              @if (submitted() && !fromEnvelopeId()) {
                <hlm-field-error forceShow>Choose the source envelope.</hlm-field-error>
              }
            </div>

            <div hlmField>
              <label hlmFieldLabel>To envelope</label>
              <hlm-select
                [value]="toEnvelopeId()"
                (valueChange)="toEnvelopeId.set($event ?? undefined)"
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
              @if (submitted() && sameEnvelopeError()) {
                <hlm-field-error forceShow>Choose two different envelopes.</hlm-field-error>
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
                <p hlmAlertTitle>Couldn't record the transfer</p>
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }

            <button hlmBtn type="submit" [disabled]="submitting()">
              @if (submitting()) {
                <hlm-spinner />
              }
              {{ submitting() ? 'Transferring\u2026' : 'Transfer' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class TransferForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly fromEnvelopeId = signal<string | undefined>(undefined);
  protected readonly toEnvelopeId = signal<string | undefined>(undefined);
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

  protected sameEnvelopeError(): boolean {
    const from = this.fromEnvelopeId();
    const to = this.toEnvelopeId();
    return !from || !to || from === to;
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);

    if (this.form.invalid || this.sameEnvelopeError() || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { amount, occurredOn, description } = this.form.getRawValue();
      await this.budget.transfer({
        fromEnvelopeId: this.fromEnvelopeId()!,
        toEnvelopeId: this.toEnvelopeId()!,
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
