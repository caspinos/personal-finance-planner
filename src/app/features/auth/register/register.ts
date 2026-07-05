import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
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
          <h1 hlmCardTitle>{{ 'auth.register.title' | transloco }}</h1>
          <p hlmCardDescription>{{ 'auth.register.description' | transloco }}</p>
        </div>

        <div hlmCardContent>
          @if (registered()) {
            <div hlmAlert>
              <p hlmAlertTitle>{{ 'auth.register.registeredTitle' | transloco }}</p>
              <p hlmAlertDescription>{{ 'auth.register.registeredDescription' | transloco }}</p>
            </div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel for="email">{{ 'auth.register.email' | transloco }}</label>
                <input hlmInput id="email" type="email" formControlName="email" autocomplete="email" />
                @if (form.controls.email.invalid && form.controls.email.touched) {
                  <hlm-field-error forceShow>{{
                    'auth.register.emailError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              <div hlmField>
                <label hlmFieldLabel for="password">{{ 'auth.register.password' | transloco }}</label>
                <input
                  hlmInput
                  id="password"
                  type="password"
                  formControlName="password"
                  autocomplete="new-password"
                />
                @if (form.controls.password.invalid && form.controls.password.touched) {
                  <hlm-field-error forceShow>{{
                    'auth.register.passwordError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'auth.register.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <button hlmBtn type="submit" [disabled]="form.invalid || submitting()">
                @if (submitting()) {
                  <hlm-spinner />
                }
                {{ (submitting() ? 'auth.register.submitting' : 'auth.register.submit') | transloco }}
              </button>
            </form>
          }
        </div>

        <div hlmCardFooter class="justify-center">
          <p class="text-muted-foreground text-sm">
            {{ 'auth.register.haveAccount' | transloco }}
            <a
              routerLink="/login"
              [queryParams]="returnUrl() ? { returnUrl: returnUrl() } : {}"
              class="text-primary underline underline-offset-4"
              >{{ 'auth.register.login' | transloco }}</a
            >
          </p>
        </div>
      </div>
    </div>
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly registered = signal(false);
  protected readonly returnUrl = signal(this.route.snapshot.queryParamMap.get('returnUrl'));

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
    const { session, error } = await this.auth.signUp(email, password);

    this.submitting.set(false);

    if (error) {
      this.errorMessage.set(error.message);
      return;
    }

    if (session) {
      await this.router.navigateByUrl(this.returnUrl() ?? '/');
      return;
    }

    this.registered.set(true);
  }
}
