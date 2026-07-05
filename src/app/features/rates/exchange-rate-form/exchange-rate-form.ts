import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule } from '@jsverse/transloco';

import { FrankfurterService } from '../../../core/rates/frankfurter.service';
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
    TranslocoModule,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-lg">
        <div hlmCardHeader>
          <h1 hlmCardTitle>
            {{ (isEditing() ? 'exchangeRateForm.editTitle' : 'exchangeRateForm.newTitle') | transloco }}
          </h1>
          <p hlmCardDescription>
            {{
              (isEditing() ? 'exchangeRateForm.editDescription' : 'exchangeRateForm.newDescription')
                | transloco
            }}
          </p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'exchangeRateForm.loading' | transloco }}
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="currency">{{ 'exchangeRateForm.currency' | transloco }}</label>
                  <input
                    hlmInput
                    id="currency"
                    type="text"
                    maxlength="3"
                    formControlName="currency"
                  />
                  @if (form.controls.currency.invalid && form.controls.currency.touched) {
                    <hlm-field-error forceShow>{{
                      'exchangeRateForm.currencyError' | transloco
                    }}</hlm-field-error>
                  }
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="rateToPln">{{
                    'exchangeRateForm.rateToPln' | transloco
                  }}</label>
                  <div class="flex gap-2">
                    <input
                      hlmInput
                      id="rateToPln"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      formControlName="rateToPln"
                      class="flex-1"
                    />
                    <button
                      hlmBtn
                      type="button"
                      variant="outline"
                      size="sm"
                      [disabled]="fetchingRate() || form.controls.currency.invalid"
                      (click)="fetchFromFrankfurter()"
                    >
                      @if (fetchingRate()) {
                        <hlm-spinner />
                      }
                      {{ 'exchangeRateForm.fetch' | transloco }}
                    </button>
                  </div>
                  @if (form.controls.rateToPln.invalid && form.controls.rateToPln.touched) {
                    <hlm-field-error forceShow>{{
                      'exchangeRateForm.rateError' | transloco
                    }}</hlm-field-error>
                  }
                  @if (fetchError()) {
                    <hlm-field-error forceShow>{{ fetchError() }}</hlm-field-error>
                  }
                </div>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="rateDate">{{ 'exchangeRateForm.rateDate' | transloco }}</label>
                <input hlmInput id="rateDate" type="date" formControlName="rateDate" />
                <hlm-field-description>
                  {{ 'exchangeRateForm.fetchHint' | transloco }}
                </hlm-field-description>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="source">{{ 'exchangeRateForm.source' | transloco }}</label>
                <input hlmInput id="source" type="text" formControlName="source" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="note">{{ 'exchangeRateForm.note' | transloco }}</label>
                <input hlmInput id="note" type="text" formControlName="note" />
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'exchangeRateForm.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{
                    (isEditing() ? 'exchangeRateForm.saveChanges' : 'exchangeRateForm.saveRate')
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
export class ExchangeRateForm {
  private readonly rates = inject(RatesService);
  private readonly frankfurter = inject(FrankfurterService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly fetchingRate = signal(false);
  protected readonly fetchError = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly rateId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.rateId() !== null);

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

  protected async fetchFromFrankfurter(): Promise<void> {
    if (this.form.controls.currency.invalid || this.fetchingRate()) {
      return;
    }

    this.fetchingRate.set(true);
    this.fetchError.set(null);

    try {
      const { currency, rateDate } = this.form.getRawValue();
      const rate = await this.frankfurter.fetchRateToPln(
        currency.toUpperCase(),
        new Date(rateDate),
      );
      this.form.patchValue({ rateToPln: rate, source: 'frankfurter.dev' });
    } catch (error) {
      this.fetchError.set(this.extractMessage(error));
    } finally {
      this.fetchingRate.set(false);
    }
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
