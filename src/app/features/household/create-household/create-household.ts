import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule } from '@jsverse/transloco';

import { HouseholdService } from '../../../core/household/household.service';

@Component({
  selector: 'app-create-household',
  imports: [
    ReactiveFormsModule,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>{{ 'household.create.title' | transloco }}</h1>
          <p hlmCardDescription>
            {{ 'household.create.description' | transloco }}
          </p>
        </div>

        <div hlmCardContent>
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
            <div hlmField>
              <label hlmFieldLabel for="name">{{ 'household.create.name' | transloco }}</label>
              <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
              @if (form.controls.name.invalid && form.controls.name.touched) {
                <hlm-field-error forceShow>{{ 'envelopeForm.nameError' | transloco }}</hlm-field-error>
              }
            </div>

            @if (errorMessage()) {
              <div hlmAlert variant="destructive">
                <p hlmAlertTitle>{{ 'household.create.errorTitle' | transloco }}</p>
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }

            <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
              @if (submitting()) {
                <hlm-spinner />
                {{ 'common.saving' | transloco }}
              } @else {
                {{ 'household.create.submit' | transloco }}
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class CreateHousehold {
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { name } = this.form.getRawValue();
      await this.households.createHousehold(name);
      await this.router.navigateByUrl('/');
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
