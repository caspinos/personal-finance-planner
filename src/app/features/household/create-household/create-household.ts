import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

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
    RouterLink,
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
            @if (hasExisting()) {
              {{ 'household.create.titleAnother' | transloco }}
            } @else {
              {{ 'household.create.title' | transloco }}
            }
          </h1>
          <p hlmCardDescription>
            @if (hasExisting()) {
              {{ 'household.create.descriptionAnother' | transloco }}
            } @else {
              {{ 'household.create.description' | transloco }}
            }
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

            @if (duplicateName(); as name) {
              <div hlmAlert>
                <p hlmAlertTitle>{{ 'household.create.duplicateTitle' | transloco }}</p>
                <p hlmAlertDescription>
                  {{ 'household.create.duplicateDescription' | transloco: { name } }}
                </p>
              </div>
            }

            @if (hasExisting()) {
              <div class="flex flex-col gap-1">
                <span class="text-sm font-medium">{{ 'household.create.existing' | transloco }}</span>
                <ul class="text-muted-foreground flex flex-col gap-1 text-sm">
                  @for (household of households.households(); track household.id) {
                    <li>{{ household.name }}</li>
                  }
                </ul>
              </div>
            }

            @if (errorMessage()) {
              <div hlmAlert variant="destructive">
                <p hlmAlertTitle>{{ 'household.create.errorTitle' | transloco }}</p>
                <p hlmAlertDescription>{{ errorMessage() }}</p>
              </div>
            }

            <div class="flex gap-2">
              <button
                hlmBtn
                type="submit"
                [disabled]="form.invalid || submitting() || loadingHouseholds()"
              >
                @if (submitting() || loadingHouseholds()) {
                  <hlm-spinner />
                }
                @if (submitting()) {
                  {{ 'common.saving' | transloco }}
                } @else {
                  {{ 'household.create.submit' | transloco }}
                }
              </button>
              @if (hasExisting()) {
                <a hlmBtn variant="outline" routerLink="/">{{ 'common.cancel' | transloco }}</a>
              }
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class CreateHousehold {
  protected readonly households = inject(HouseholdService);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly loadingHouseholds = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  private readonly name = toSignal(this.form.controls.name.valueChanges, {
    initialValue: this.form.controls.name.value,
  });

  protected readonly hasExisting = computed(() => this.households.households().length > 0);

  /**
   * Creating a second household with the same name is how an account ends up
   * with two indistinguishable entries in the switcher, so surface the clash
   * while it can still be avoided. It stays a warning, not a validation error:
   * separate households really can share a name.
   */
  protected readonly duplicateName = computed(() => {
    const typed = this.name().trim().toLocaleLowerCase();
    if (!typed) {
      return null;
    }

    return (
      this.households
        .households()
        .find((household) => household.name.trim().toLocaleLowerCase() === typed)?.name ?? null
    );
  });

  constructor() {
    // Reachable directly (deep link, or the header's "new household" action),
    // so the list this page reasons about may not have been fetched yet. The
    // form stays disabled until it settles: submitting before the list arrives
    // would show the first-run page and skip the duplicate warning entirely,
    // which is exactly the case this page exists to catch.
    if (!this.households.loaded()) {
      this.loadingHouseholds.set(true);
      this.form.disable();
      void this.households
        .loadHouseholds()
        .catch(() => {
          // Non-fatal: without the list there is no duplicate hint to show, but
          // creating a household must still be possible.
        })
        .finally(() => {
          this.loadingHouseholds.set(false);
          this.form.enable();
        });
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting() || this.loadingHouseholds()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      const { name } = this.form.getRawValue();
      const created = await this.households.createHousehold(name);
      // Enter the new household the same way the switcher does, so no data
      // cached for the previous one is left in the root services.
      this.households.switchHousehold(created.id);
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
