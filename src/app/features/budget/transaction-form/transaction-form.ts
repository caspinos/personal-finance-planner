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
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';
import { TranslocoModule } from '@jsverse/transloco';

import {
  BudgetService,
  BudgetTransactionType,
  TransactionNameSuggestion,
} from '../../../core/budget/budget.service';

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
    TranslocoModule,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>
            {{
              (isEditing() ? 'transactionForm.editTitle' : 'transactionForm.newTitle') | transloco
            }}
          </h1>
          <p hlmCardDescription>
            {{
              (isEditing() ? 'transactionForm.editDescription' : 'transactionForm.newDescription')
                | transloco
            }}
          </p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'transactionForm.loading' | transloco }}
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>{{ 'transactionForm.type' | transloco }}</label>
                <hlm-toggle-group
                  type="single"
                  [value]="type()"
                  (valueChange)="onTypeChange($event)"
                >
                  <button hlmToggleGroupItem value="expense" type="button">
                    {{ 'transactionForm.expense' | transloco }}
                  </button>
                  <button hlmToggleGroupItem value="income" type="button">
                    {{ 'transactionForm.income' | transloco }}
                  </button>
                </hlm-toggle-group>
              </div>

              <div hlmField>
                <label hlmFieldLabel>{{ 'transactionForm.envelope' | transloco }}</label>
                <hlm-select
                  [value]="envelopeId()"
                  (valueChange)="envelopeId.set($event ?? undefined)"
                  [itemToString]="envelopeToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value
                      [placeholder]="'transactionForm.chooseEnvelope' | transloco"
                    />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (envelope of envelopes(); track envelope.id) {
                      <hlm-select-item [value]="envelope.id">{{ envelope.name }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
                @if (submitted() && !envelopeId()) {
                  <hlm-field-error forceShow>{{
                    'transactionForm.chooseEnvelopeError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="amount">{{ 'transactionForm.amount' | transloco }}</label>
                <input
                  hlmInput
                  id="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  formControlName="amount"
                />
                @if (form.controls.amount.invalid && form.controls.amount.touched) {
                  <hlm-field-error forceShow>{{
                    'transactionForm.amountError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="occurredOn">{{
                  'transactionForm.date' | transloco
                }}</label>
                <input hlmInput id="occurredOn" type="date" formControlName="occurredOn" />
              </div>

              @if (type() === 'expense') {
                <div hlmField>
                  <div class="flex items-center gap-2">
                    <input
                      id="amortize"
                      type="checkbox"
                      class="accent-primary size-4"
                      formControlName="amortize"
                    />
                    <label hlmFieldLabel for="amortize" class="mb-0">
                      {{ 'transactionForm.amortizeLabel' | transloco }}
                    </label>
                  </div>
                  <p class="text-muted-foreground text-sm">
                    {{ 'transactionForm.amortizeHint' | transloco }}
                  </p>
                </div>

                @if (form.controls.amortize.value) {
                  <div hlmField>
                    <label hlmFieldLabel for="amortizedMonths">{{
                      'transactionForm.amortizedMonths' | transloco
                    }}</label>
                    <input
                      hlmInput
                      id="amortizedMonths"
                      type="number"
                      min="2"
                      max="120"
                      step="1"
                      formControlName="amortizedMonths"
                    />
                    @if (
                      form.controls.amortizedMonths.invalid && form.controls.amortizedMonths.touched
                    ) {
                      <hlm-field-error forceShow>{{
                        'transactionForm.amortizedMonthsError' | transloco
                      }}</hlm-field-error>
                    }
                    @if (amortizedMonthlyPreview(); as preview) {
                      <p class="text-muted-foreground text-sm">
                        {{ 'transactionForm.amortizePreview' | transloco: { amount: preview } }}
                      </p>
                    }
                  </div>
                }
              }

              <div hlmField>
                <label hlmFieldLabel for="name">{{ 'transactionForm.name' | transloco }}</label>
                <input
                  hlmInput
                  id="name"
                  type="text"
                  formControlName="name"
                  autocomplete="off"
                  list="transaction-name-suggestions"
                  (input)="onNameInput()"
                />
                <datalist id="transaction-name-suggestions">
                  @for (suggestion of nameSuggestions(); track suggestion.name) {
                    <option [value]="suggestion.name"></option>
                  }
                </datalist>
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <hlm-field-error forceShow>{{
                    'transactionForm.nameError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'transactionForm.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{
                    (isEditing() ? 'transactionForm.saveChanges' : 'transactionForm.save')
                      | transloco
                  }}
                }
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class TransactionForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly type = signal<BudgetTransactionType>('expense');
  protected readonly envelopeId = signal<string | undefined>(undefined);
  protected readonly submitting = signal(false);
  protected readonly loading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly transactionId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.transactionId() !== null);

  protected readonly envelopeToString = (id: string): string =>
    this.envelopes().find((envelope) => envelope.id === id)?.name ?? '';

  protected readonly nameSuggestions = signal<TransactionNameSuggestion[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    occurredOn: [toDateInputValue(new Date()), Validators.required],
    name: ['', [Validators.required, Validators.minLength(1)]],
    amortize: [false],
    amortizedMonths: [12, [Validators.min(2), Validators.max(120)]],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected onTypeChange(
    value: BudgetTransactionType | BudgetTransactionType[] | null | undefined,
  ): void {
    if (value === 'expense' || value === 'income') {
      this.type.set(value);
      // Amortization is expense-only; clear it when switching to income.
      if (value === 'income') {
        this.form.controls.amortize.setValue(false);
      }
    }
  }

  /** Rounded monthly slice preview (total / months), or null when not applicable. */
  protected amortizedMonthlyPreview(): string | null {
    const { amount, amortize, amortizedMonths } = this.form.getRawValue();
    if (
      this.type() !== 'expense' ||
      !amortize ||
      !amount ||
      !amortizedMonths ||
      amortizedMonths < 2
    ) {
      return null;
    }
    return (Math.round((amount / amortizedMonths) * 100) / 100).toFixed(2);
  }

  protected onNameInput(): void {
    const name = this.form.controls.name.value;
    const suggestion = this.nameSuggestions().find((s) => s.name === name);
    if (suggestion) {
      this.envelopeId.set(suggestion.envelope_id);
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
      const { amount, occurredOn, name, amortize, amortizedMonths } = this.form.getRawValue();
      const input = {
        envelopeId: this.envelopeId()!,
        type: this.type(),
        amount,
        occurredOn: new Date(occurredOn),
        name,
        amortizedMonths: this.type() === 'expense' && amortize ? amortizedMonths : null,
      };

      if (this.transactionId()) {
        await this.budget.updateTransaction(this.transactionId()!, input);
        await this.router.navigateByUrl(`/budget/envelopes/${this.envelopeId()}`);
      } else {
        await this.budget.recordTransaction(input);
        await this.router.navigateByUrl('/budget');
      }
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
      const [, nameSuggestions] = await Promise.all([
        this.budget.loadEnvelopes(),
        this.budget.loadTransactionNameSuggestions(),
      ]);
      this.nameSuggestions.set(nameSuggestions);

      if (this.transactionId()) {
        const transaction = await this.budget.loadTransaction(this.transactionId()!);
        this.type.set(transaction.type);
        this.envelopeId.set(transaction.envelope_id);
        this.form.patchValue({
          amount: Number(transaction.amount),
          occurredOn: transaction.occurred_on,
          name: transaction.name,
          amortize: transaction.amortized_months !== null,
          amortizedMonths: transaction.amortized_months ?? 12,
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
