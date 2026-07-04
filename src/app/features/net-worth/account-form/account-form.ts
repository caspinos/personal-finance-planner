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

import {
  AssetAccountType,
  AssetLiquidityClass,
  NetWorthService,
} from '../../../core/net-worth/net-worth.service';

const ACCOUNT_TYPES: Array<{ value: AssetAccountType; label: string }> = [
  { value: 'bank', label: 'Bank account' },
  { value: 'investment', label: 'Investment account' },
  { value: 'cash', label: 'Cash' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'precious_metals', label: 'Precious metals' },
  { value: 'currency', label: 'Currency' },
  { value: 'other_asset', label: 'Other asset' },
  { value: 'liability', label: 'Liability' },
];

const LIQUIDITY_CLASSES: Array<{ value: AssetLiquidityClass; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'restricted', label: 'Restricted' },
  { value: 'illiquid', label: 'Illiquid' },
  { value: 'liability', label: 'Liability' },
];

@Component({
  selector: 'app-account-form',
  imports: [
    ReactiveFormsModule,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSpinnerImports,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-lg">
        <div hlmCardHeader>
          <h1 hlmCardTitle>New asset account</h1>
          <p hlmCardDescription>
            Add a bank account, investment account, asset, or liability to track net worth.
          </p>
        </div>

        <div hlmCardContent>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel for="name">Account name</label>
              <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
              @if (form.controls.name.invalid && form.controls.name.touched) {
                <hlm-field-error forceShow>Enter at least 2 characters.</hlm-field-error>
              }
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div hlmField>
                <label hlmFieldLabel>Type</label>
                <hlm-select
                  [value]="type()"
                  (valueChange)="setType($event)"
                  [itemToString]="accountTypeToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value placeholder="Choose type" />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (option of accountTypes; track option.value) {
                      <hlm-select-item [value]="option.value">{{ option.label }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
              </div>

              <div hlmField>
                <label hlmFieldLabel>Liquidity</label>
                <hlm-select
                  [value]="liquidity()"
                  (valueChange)="setLiquidity($event)"
                  [itemToString]="liquidityToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value placeholder="Choose liquidity" />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (option of liquidityClasses; track option.value) {
                      <hlm-select-item [value]="option.value">{{ option.label }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
              </div>
            </div>

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
              </div>

              <div hlmField>
                <label hlmFieldLabel for="institution">Institution (optional)</label>
                <input hlmInput id="institution" type="text" formControlName="institution" />
              </div>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div hlmField>
                <label hlmFieldLabel for="category">Category (optional)</label>
                <input hlmInput id="category" type="text" formControlName="category" />
              </div>

              <div hlmField>
                <label hlmFieldLabel for="ownerName">Owner (optional)</label>
                <input hlmInput id="ownerName" type="text" formControlName="ownerName" />
              </div>
            </div>

            @if (errorMessage()) {
              <div hlmAlert variant="destructive">
                <p hlmAlertTitle>Couldn't create the account</p>
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }

            <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
              @if (submitting()) {
                <hlm-spinner />
              }
              {{ submitting() ? 'Creating...' : 'Create account' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class AccountForm {
  private readonly netWorth = inject(NetWorthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly accountTypes = ACCOUNT_TYPES;
  protected readonly liquidityClasses = LIQUIDITY_CLASSES;
  protected readonly type = signal<AssetAccountType>('bank');
  protected readonly liquidity = signal<AssetLiquidityClass>('liquid');
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly accountTypeToString = (value: AssetAccountType): string =>
    ACCOUNT_TYPES.find((option) => option.value === value)?.label ?? '';
  protected readonly liquidityToString = (value: AssetLiquidityClass): string =>
    LIQUIDITY_CLASSES.find((option) => option.value === value)?.label ?? '';

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    currency: ['PLN', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    institution: [''],
    category: [''],
    ownerName: [''],
  });

  protected setType(value: AssetAccountType | AssetAccountType[] | null | undefined): void {
    if (typeof value === 'string') {
      this.type.set(value);
      if (value === 'liability') {
        this.liquidity.set('liability');
      }
    }
  }

  protected setLiquidity(
    value: AssetLiquidityClass | AssetLiquidityClass[] | null | undefined,
  ): void {
    if (typeof value === 'string') {
      this.liquidity.set(value);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { name, currency, institution, category, ownerName } = this.form.getRawValue();
      await this.netWorth.createAccount({
        name,
        type: this.type(),
        currency: currency.toUpperCase(),
        institution,
        category,
        ownerName,
        liquidity: this.liquidity(),
      });
      await this.router.navigateByUrl('/net-worth');
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
