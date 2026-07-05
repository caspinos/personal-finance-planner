import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule } from '@jsverse/transloco';

import { NetWorthService } from '../../../core/net-worth/net-worth.service';

@Component({
  selector: 'app-holding-form',
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
          <h1 hlmCardTitle>{{ 'holdingForm.title' | transloco }}</h1>
          <p hlmCardDescription>
            {{ 'holdingForm.description' | transloco }}
          </p>
        </div>

        <div hlmCardContent>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel for="name">{{ 'holdingForm.name' | transloco }}</label>
              <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
              @if (form.controls.name.invalid && form.controls.name.touched) {
                <hlm-field-error forceShow>{{ 'holdingForm.nameError' | transloco }}</hlm-field-error>
              }
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div hlmField>
                <label hlmFieldLabel for="ticker">{{ 'holdingForm.ticker' | transloco }}</label>
                <input hlmInput id="ticker" type="text" formControlName="ticker" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="currency">{{ 'holdingForm.currency' | transloco }}</label>
                <input
                  hlmInput
                  id="currency"
                  type="text"
                  maxlength="3"
                  formControlName="currency"
                />
              </div>
            </div>

            @if (errorMessage()) {
              <div hlmAlert variant="destructive">
                <p hlmAlertTitle>{{ 'holdingForm.errorTitle' | transloco }}</p>
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }

            <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
              @if (submitting()) {
                <hlm-spinner />
              }
              {{ (submitting() ? 'holdingForm.creating' : 'holdingForm.create') | transloco }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class HoldingForm {
  private readonly netWorth = inject(NetWorthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly accountId = signal<string>(
    this.route.snapshot.queryParamMap.get('accountId') ?? '',
  );
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    ticker: [''],
    currency: ['PLN', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
  });

  constructor() {
    if (!this.accountId()) {
      void this.router.navigateByUrl('/net-worth');
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { name, ticker, currency } = this.form.getRawValue();
      await this.netWorth.createHolding({
        accountId: this.accountId(),
        name,
        ticker,
        currency: currency.toUpperCase(),
      });
      await this.router.navigateByUrl(`/net-worth/accounts/${this.accountId()}`);
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
