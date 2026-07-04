import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="auth-page">
      <h1>Create an account</h1>

      @if (registered()) {
        <p role="status">
          Almost done! Check your email to confirm your account, then log in.
        </p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" type="email" formControlName="email" autocomplete="email" />
          </div>

          <div class="field">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              formControlName="password"
              autocomplete="new-password"
            />
          </div>

          @if (errorMessage()) {
            <p class="error" role="alert">{{ errorMessage() }}</p>
          }

          <button type="submit" [disabled]="form.invalid || submitting()">
            {{ submitting() ? 'Creating account…' : 'Create account' }}
          </button>
        </form>
      }

      <p>Already have an account? <a routerLink="/login">Log in</a></p>
    </section>
  `,
  styles: `
    .auth-page {
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
export class Register {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registered = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();
    const { error } = await this.auth.signUp(email, password);

    this.submitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    this.registered.set(true);
  }
}
