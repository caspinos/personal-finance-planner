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

import { BudgetService } from '../../../core/budget/budget.service';

@Component({
  selector: 'app-envelope-form',
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
          <h1 hlmCardTitle>
            {{ (isEditing() ? 'envelopeForm.renameTitle' : 'envelopeForm.newTitle') | transloco }}
          </h1>
          <p hlmCardDescription>
            {{ 'envelopeForm.description' | transloco }}
          </p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'envelopeForm.loading' | transloco }}
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel for="name">{{ 'envelopeForm.name' | transloco }}</label>
                <input hlmInput id="name" type="text" formControlName="name" autocomplete="off" />
                @if (form.controls.name.invalid && form.controls.name.touched) {
                  <hlm-field-error forceShow>{{ 'envelopeForm.nameError' | transloco }}</hlm-field-error>
                }
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>
                    {{
                      (isEditing() ? 'envelopeForm.renameErrorTitle' : 'envelopeForm.createErrorTitle')
                        | transloco
                    }}
                  </p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{ (isEditing() ? 'envelopeForm.saveChanges' : 'envelopeForm.create') | transloco }}
                }
              </button>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class EnvelopeForm {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly envelopeId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  protected readonly isEditing = computed(() => this.envelopeId() !== null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
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
      const { name } = this.form.getRawValue();
      const envelopeId = this.envelopeId();

      if (envelopeId) {
        await this.budget.updateEnvelope(envelopeId, name);
      } else {
        await this.budget.createEnvelope(name);
      }

      await this.router.navigateByUrl('/budget');
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private async loadInitialData(): Promise<void> {
    const envelopeId = this.envelopeId();
    if (!envelopeId) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const envelope = await this.budget.loadEnvelope(envelopeId);
      this.form.patchValue({ name: envelope.name });
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
