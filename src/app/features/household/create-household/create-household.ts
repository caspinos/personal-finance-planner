import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { HouseholdService } from '../../../core/household/household.service';

@Component({
  selector: 'app-create-household',
  imports: [ReactiveFormsModule],
  template: `
    <section class="create-household-page">
      <h1>Create your household</h1>
      <p>A household groups your budget and net worth data and can be shared with others later.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="name">Household name</label>
          <input id="name" type="text" formControlName="name" autocomplete="off" />
        </div>

        @if (errorMessage()) {
          <p class="error" role="alert">{{ errorMessage() }}</p>
        }

        <button type="submit" [disabled]="form.invalid || submitting()">
          {{ submitting() ? 'Creating…' : 'Create household' }}
        </button>
      </form>
    </section>
  `,
  styles: `
    .create-household-page {
      max-width: 24rem;
      margin: 4rem auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-bottom: 1rem;
    }

    .error {
      color: #b3261e;
    }
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
      this.errorMessage.set(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      this.submitting.set(false);
    }
  }
}
