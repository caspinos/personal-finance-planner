import { Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  FormControl,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { HlmToggleGroupImports } from '@spartan-ng/helm/toggle-group';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';

import { BudgetService, Envelope } from '../../../core/budget/budget.service';

type FundingFrequency = 'once' | 'monthly';

type FundingRowGroup = FormGroup<{
  selected: FormControl<boolean>;
  amount: FormControl<number>;
}>;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createRow(): FundingRowGroup {
  return new FormGroup({
    selected: new FormControl(false, { nonNullable: true }),
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.min(0.01)] }),
  });
}

@Component({
  selector: 'app-bulk-funding-form',
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmToggleGroupImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-2xl">
        <div hlmCardHeader>
          <h1 hlmCardTitle>{{ 'bulkFundingForm.title' | transloco }}</h1>
          <p hlmCardDescription>{{ 'bulkFundingForm.description' | transloco }}</p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'bulkFundingForm.loading' | transloco }}
            </div>
          } @else if (errorMessage() && envelopes().length === 0) {
            <div hlmAlert variant="destructive">
              <p hlmAlertTitle>{{ 'bulkFundingForm.errorTitle' | transloco }}</p>
              <p hlmAlertDescription>{{ errorMessage() }}</p>
            </div>
          } @else if (envelopes().length === 0) {
            <p class="text-muted-foreground text-sm">
              {{ 'bulkFundingForm.noEnvelopesDescription' | transloco }}
            </p>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>{{ 'bulkFundingForm.frequency' | transloco }}</label>
                <hlm-toggle-group
                  type="single"
                  [value]="frequency()"
                  (valueChange)="onFrequencyChange($event)"
                >
                  <button hlmToggleGroupItem value="once" type="button">
                    {{ 'bulkFundingForm.once' | transloco }}
                  </button>
                  <button hlmToggleGroupItem value="monthly" type="button">
                    {{ 'bulkFundingForm.monthly' | transloco }}
                  </button>
                </hlm-toggle-group>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="name">{{ 'bulkFundingForm.name' | transloco }}</label>
                <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <hlm-field-error forceShow>{{
                    'bulkFundingForm.nameError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              @if (frequency() === 'once') {
                <div hlmField>
                  <label hlmFieldLabel for="occurredOn">{{
                    'bulkFundingForm.date' | transloco
                  }}</label>
                  <input hlmInput id="occurredOn" type="date" formControlName="occurredOn" />
                </div>
              } @else {
                <div hlmField>
                  <label hlmFieldLabel for="dayOfMonth">{{
                    'bulkFundingForm.dayOfMonth' | transloco
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
                    {{ 'bulkFundingForm.dayOfMonthDescription' | transloco }}
                  </hlm-field-description>
                  @if (form.controls.dayOfMonth.invalid && form.controls.dayOfMonth.touched) {
                    <hlm-field-error forceShow>{{
                      'bulkFundingForm.dayOfMonthError' | transloco
                    }}</hlm-field-error>
                  }
                </div>
              }

              <div hlmField>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label hlmFieldLabel>{{ 'bulkFundingForm.envelopesTitle' | transloco }}</label>
                  <div class="flex gap-2">
                    <button
                      hlmBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      (click)="setAllSelected(true)"
                    >
                      {{ 'bulkFundingForm.selectAll' | transloco }}
                    </button>
                    <button
                      hlmBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      (click)="setAllSelected(false)"
                    >
                      {{ 'bulkFundingForm.clearAll' | transloco }}
                    </button>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <input
                    hlmInput
                    type="number"
                    min="0.01"
                    step="0.01"
                    class="max-w-32"
                    [placeholder]="'bulkFundingForm.quickAmount' | transloco"
                    [value]="quickAmount()"
                    (input)="onQuickAmountInput($event)"
                  />
                  <button hlmBtn variant="outline" size="sm" type="button" (click)="applyQuickAmount()">
                    {{ 'bulkFundingForm.applyToSelected' | transloco }}
                  </button>
                </div>

                <ul class="flex flex-col gap-2">
                  @for (envelope of envelopes(); track envelope.id; let i = $index) {
                    <li [formGroup]="rowAt(i)" class="flex items-center gap-3">
                      <input
                        type="checkbox"
                        formControlName="selected"
                        class="border-input accent-foreground h-4 w-4 shrink-0 cursor-pointer rounded"
                      />
                      <span class="min-w-0 flex-1 truncate">{{ envelope.name }}</span>
                      <input
                        hlmInput
                        type="number"
                        min="0.01"
                        step="0.01"
                        class="max-w-32"
                        formControlName="amount"
                        [disabled]="!rowAt(i).controls.selected.value"
                      />
                    </li>
                  }
                </ul>

                @if (submitted() && noEnvelopesSelected()) {
                  <hlm-field-error forceShow>{{
                    'bulkFundingForm.noEnvelopesSelectedError' | transloco
                  }}</hlm-field-error>
                }
                @if (submitted() && !noEnvelopesSelected() && hasInvalidAmount()) {
                  <hlm-field-error forceShow>{{
                    'bulkFundingForm.amountError' | transloco
                  }}</hlm-field-error>
                }

                <p class="text-muted-foreground text-sm">
                  {{
                    'bulkFundingForm.selectedSummary'
                      | transloco: { count: selectedCount(), total: totalAmount() | number: '1.2-2' }
                  }}
                </p>
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'bulkFundingForm.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{
                    (frequency() === 'once'
                      ? 'bulkFundingForm.submitOnce'
                      : 'bulkFundingForm.submitMonthly') | transloco
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
export class BulkFundingForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);

  protected readonly envelopes = this.budget.activeEnvelopes;
  protected readonly frequency = signal<FundingFrequency>('once');
  protected readonly submitting = signal(false);
  protected readonly loading = signal(true);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly quickAmount = signal(0);
  protected readonly rowsArray: FundingRowGroup[] = [];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    occurredOn: [toDateInputValue(new Date()), Validators.required],
    dayOfMonth: [1, [Validators.required, Validators.min(1), Validators.max(28)]],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected rowAt(index: number): FundingRowGroup {
    return this.rowsArray[index];
  }

  protected onFrequencyChange(
    value: FundingFrequency | FundingFrequency[] | null | undefined,
  ): void {
    if (value === 'once' || value === 'monthly') {
      this.frequency.set(value);
    }
  }

  protected setAllSelected(selected: boolean): void {
    for (const row of this.rowsArray) {
      row.controls.selected.setValue(selected);
    }
  }

  protected onQuickAmountInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.quickAmount.set(Number.isFinite(value) ? value : 0);
  }

  protected applyQuickAmount(): void {
    const amount = this.quickAmount();
    if (!amount || amount <= 0) {
      return;
    }

    for (const row of this.rowsArray) {
      if (row.controls.selected.value) {
        row.controls.amount.setValue(amount);
      }
    }
  }

  protected selectedRows(): { envelope: Envelope; amount: number }[] {
    return this.envelopes()
      .map((envelope, i) => ({
        envelope,
        amount: this.rowAt(i).controls.amount.value,
        selected: this.rowAt(i).controls.selected.value,
      }))
      .filter((row) => row.selected);
  }

  protected selectedCount(): number {
    return this.selectedRows().length;
  }

  protected totalAmount(): number {
    return this.selectedRows().reduce((sum, row) => sum + (row.amount || 0), 0);
  }

  protected noEnvelopesSelected(): boolean {
    return this.selectedRows().length === 0;
  }

  protected hasInvalidAmount(): boolean {
    return this.selectedRows().some((row) => !row.amount || row.amount <= 0);
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.errorMessage.set(null);

    const rows = this.selectedRows();

    if (
      this.form.invalid ||
      this.submitting() ||
      rows.length === 0 ||
      rows.some((row) => !row.amount || row.amount <= 0)
    ) {
      return;
    }

    this.submitting.set(true);

    const { name, occurredOn, dayOfMonth } = this.form.getRawValue();
    const frequency = this.frequency();
    let created = 0;

    try {
      for (const row of rows) {
        if (frequency === 'once') {
          await this.budget.recordTransaction({
            envelopeId: row.envelope.id,
            type: 'income',
            amount: row.amount,
            occurredOn: new Date(occurredOn),
            name,
          });
        } else {
          await this.budget.createRecurringRule({
            envelopeId: row.envelope.id,
            type: 'income',
            amount: row.amount,
            name,
            dayOfMonth,
          });
        }
        created++;
      }

      await this.router.navigateByUrl('/budget');
    } catch (error) {
      const message = this.extractMessage(error);
      this.errorMessage.set(
        created > 0
          ? `${message} ${this.transloco.translate('bulkFundingForm.partialSaveNote', { count: created })}`
          : message,
      );
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadInitialData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.budget.loadEnvelopes();
      this.rowsArray.length = 0;
      for (const _ of this.envelopes()) {
        this.rowsArray.push(createRow());
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
