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

import { BudgetService, BudgetTransactionType } from '../../../core/budget/budget.service';

@Component({
  selector: 'app-recurring-rule-form',
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
            {{ (isEditing() ? 'recurringRuleForm.editTitle' : 'recurringRuleForm.newTitle') | transloco }}
          </h1>
          <p hlmCardDescription>{{ 'recurringRuleForm.description' | transloco }}</p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'recurringRuleForm.loading' | transloco }}
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>{{ 'recurringRuleForm.type' | transloco }}</label>
                <hlm-toggle-group
                  type="single"
                  [value]="type()"
                  (valueChange)="onTypeChange($event)"
                >
                  <button hlmToggleGroupItem value="income" type="button">
                    {{ 'recurringRuleForm.topUp' | transloco }}
                  </button>
                  <button hlmToggleGroupItem value="expense" type="button">
                    {{ 'recurringRuleForm.charge' | transloco }}
                  </button>
                </hlm-toggle-group>
              </div>

              <div hlmField>
                <label hlmFieldLabel>{{ 'recurringRuleForm.envelope' | transloco }}</label>
                <hlm-select
                  [value]="envelopeId()"
                  (valueChange)="envelopeId.set($event ?? undefined)"
                  [itemToString]="envelopeToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value [placeholder]="'recurringRuleForm.chooseEnvelope' | transloco" />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (envelope of envelopes(); track envelope.id) {
                      <hlm-select-item [value]="envelope.id">{{ envelope.name }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
                @if (submitted() && !envelopeId()) {
                  <hlm-field-error forceShow>{{
                    'recurringRuleForm.chooseEnvelopeError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="name">{{ 'recurringRuleForm.name' | transloco }}</label>
                <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <hlm-field-error forceShow>{{
                    'recurringRuleForm.nameError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="amount">{{ 'recurringRuleForm.amount' | transloco }}</label>
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
                    'recurringRuleForm.amountError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="dayOfMonth">{{
                  'recurringRuleForm.dayOfMonth' | transloco
                }}</label>
                <input
                  hlmInput
                  id="dayOfMonth"
                  type="number"
                  min="1"
                  max="28"
                  step="1"
                  formControlName="dayOfMonth"
                />
                <hlm-field-description>
                  {{ 'recurringRuleForm.dayOfMonthDescription' | transloco }}
                </hlm-field-description>
                @if (form.controls.dayOfMonth.invalid && form.controls.dayOfMonth.touched) {
                  <hlm-field-error forceShow>{{
                    'recurringRuleForm.dayOfMonthError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'recurringRuleForm.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{ (isEditing() ? 'recurringRuleForm.saveChanges' : 'recurringRuleForm.create') | transloco }}
                }
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class RecurringRuleForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly type = signal<BudgetTransactionType>('income');
  protected readonly envelopeId = signal<string | undefined>(undefined);
  protected readonly submitting = signal(false);
  protected readonly loading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly ruleId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.ruleId() !== null);

  protected readonly envelopeToString = (id: string): string =>
    this.envelopes().find((envelope) => envelope.id === id)?.name ?? '';

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    dayOfMonth: [1, [Validators.required, Validators.min(1), Validators.max(28)]],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected onTypeChange(
    value: BudgetTransactionType | BudgetTransactionType[] | null | undefined,
  ): void {
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
      const { name, amount, dayOfMonth } = this.form.getRawValue();
      const input = {
        envelopeId: this.envelopeId()!,
        type: this.type(),
        amount,
        name,
        dayOfMonth,
      };

      if (this.ruleId()) {
        await this.budget.updateRecurringRule(this.ruleId()!, input);
      } else {
        await this.budget.createRecurringRule(input);
      }

      await this.router.navigateByUrl('/budget');
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
      await this.budget.loadEnvelopes();

      if (this.ruleId()) {
        const rule = await this.budget.loadRecurringRule(this.ruleId()!);
        this.type.set(rule.type);
        this.envelopeId.set(rule.envelope_id);
        this.form.patchValue({
          name: rule.name,
          amount: Number(rule.amount),
          dayOfMonth: rule.day_of_month,
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
