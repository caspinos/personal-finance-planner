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

import { RatesService } from '../../../core/rates/rates.service';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'app-commodity-price-form',
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
            {{
              (isEditing() ? 'commodityPriceForm.editTitle' : 'commodityPriceForm.newTitle')
                | transloco
            }}
          </h1>
          <p hlmCardDescription>
            {{
              (isEditing()
                ? 'commodityPriceForm.editDescription'
                : 'commodityPriceForm.newDescription') | transloco
            }}
          </p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'commodityPriceForm.loading' | transloco }}
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel for="commodity">{{ 'commodityPriceForm.commodity' | transloco }}</label>
                <input
                  hlmInput
                  id="commodity"
                  type="text"
                  [placeholder]="'commodityPriceForm.commodityPlaceholder' | transloco"
                  formControlName="commodity"
                />
                @if (form.controls.commodity.invalid && form.controls.commodity.touched) {
                  <hlm-field-error forceShow>{{
                    'commodityPriceForm.commodityError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div class="grid gap-4 sm:grid-cols-2">
                <div hlmField>
                  <label hlmFieldLabel for="price">{{ 'commodityPriceForm.price' | transloco }}</label>
                  <input
                    hlmInput
                    id="price"
                    type="number"
                    min="0"
                    step="0.0001"
                    formControlName="price"
                  />
                  @if (form.controls.price.invalid && form.controls.price.touched) {
                    <hlm-field-error forceShow>{{
                      'commodityPriceForm.priceError' | transloco
                    }}</hlm-field-error>
                  }
                </div>

                <div hlmField>
                  <label hlmFieldLabel for="currency">{{ 'commodityPriceForm.currency' | transloco }}</label>
                  <input
                    hlmInput
                    id="currency"
                    type="text"
                    maxlength="3"
                    formControlName="currency"
                  />
                  @if (form.controls.currency.invalid && form.controls.currency.touched) {
                    <hlm-field-error forceShow>{{
                      'commodityPriceForm.currencyError' | transloco
                    }}</hlm-field-error>
                  }
                </div>
              </div>

              <div hlmField>
                <label hlmFieldLabel for="priceDate">{{ 'commodityPriceForm.priceDate' | transloco }}</label>
                <input hlmInput id="priceDate" type="date" formControlName="priceDate" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="source">{{ 'commodityPriceForm.source' | transloco }}</label>
                <input hlmInput id="source" type="text" formControlName="source" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="note">{{ 'commodityPriceForm.note' | transloco }}</label>
                <input hlmInput id="note" type="text" formControlName="note" />
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'commodityPriceForm.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{
                    (isEditing() ? 'commodityPriceForm.saveChanges' : 'commodityPriceForm.savePrice')
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
export class CommodityPriceForm {
  private readonly rates = inject(RatesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly priceId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.priceId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    commodity: ['', [Validators.required, Validators.minLength(2)]],
    price: [0, [Validators.required, Validators.min(0)]],
    currency: ['PLN', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    priceDate: [toDateInputValue(new Date()), Validators.required],
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
      const { commodity, price, currency, priceDate, source, note } = this.form.getRawValue();
      const input = {
        commodity,
        price,
        currency: currency.toUpperCase(),
        priceDate: new Date(priceDate),
        source,
        note,
      };

      if (this.priceId()) {
        await this.rates.updateCommodityPrice(this.priceId()!, input);
      } else {
        await this.rates.createCommodityPrice(input);
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
      if (this.priceId()) {
        const price = await this.rates.loadCommodityPrice(this.priceId()!);
        this.form.patchValue({
          commodity: price.commodity,
          price: Number(price.price),
          currency: price.currency,
          priceDate: price.price_date,
          source: price.source ?? '',
          note: price.note ?? '',
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
