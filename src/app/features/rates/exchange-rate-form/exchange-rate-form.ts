import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { RatesService } from '../../../core/rates/rates.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-exchange-rate-form',
  imports: [
    ReactiveFormsModule,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
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
              Loading rate...
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="currency">Currency</label>
                  <input
                    hlmInput
                    id="currency"
                    type="text"
                    maxlength="3"
                    formControlName="currency"
                  />
                  @if (form.controls.currency.invalid && form.controls.currency.touched) {
                    <hlm-field-error forceShow>Enter a 3-letter currency code.</hlm-field-error>
                  }
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="rateToPln">Rate to PLN</label>
                  <input
                    hlmInput
                    id="rateToPln"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    formControlName="rateToPln"
                  />
                  @if (form.controls.rateToPln.invalid && form.controls.rateToPln.touched) {
                    <hlm-field-error forceShow>Enter a rate greater than 0.</hlm-field-error>
                  }
                </div>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="rateDate">Rate date</label>
                <input hlmInput id="rateDate" type="date" formControlName="rateDate" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="source">Source (optional)</label>
                <input hlmInput id="source" type="text" formControlName="source" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="note">Note (optional)</label>
                <input hlmInput id="note" type="text" formControlName="note" />
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>Couldn't save the rate</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
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
export class ExchangeRateForm {
  private readonly rates = inject(RatesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly rateId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.rateId() !== null);
  protected readonly title = computed(() =>
    this.isEditing() ? 'Edit exchange rate' : 'New exchange rate',
  );
  protected readonly description = computed(() =>
    this.isEditing()
      ? 'Update this dated exchange rate.'
      : 'Record how much 1 unit of a currency is worth in PLN, as of a date.',
  );
  protected readonly submitLabel = computed(() =>
    this.isEditing() ? 'Save changes' : 'Save rate',
  );

  protected readonly form = this.fb.nonNullable.group({
    currency: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    rateToPln: [0, [Validators.required, Validators.min(0.000001)]],
    rateDate: [toDateInputValue(new Date()), Validators.required],
    source: [''],
    note: [''],
  });

  constructor() {
    void this.loadInitialData();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { currency, rateToPln, rateDate, source, note } = this.form.getRawValue();
      const input = {
        currency: currency.toUpperCase(),
        rateToPln,
        rateDate: new Date(rateDate),
        source,
        note,
      };

      if (this.rateId()) {
        await this.rates.updateExchangeRate(this.rateId()!, input);
      } else {
        await this.rates.createExchangeRate(input);
      }

      await this.router.navigateByUrl('/rates');
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
      if (this.rateId()) {
        const rate = await this.rates.loadExchangeRate(this.rateId()!);
        this.form.patchValue({
          currency: rate.currency,
          rateToPln: Number(rate.rate_to_pln),
          rateDate: rate.rate_date,
          source: rate.source ?? '',
          note: rate.note ?? '',
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
