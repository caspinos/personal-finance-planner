import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';
import { TranslocoModule } from '@jsverse/transloco';

import { BudgetService, Envelope } from '../../../core/budget/budget.service';

@Component({
  selector: 'app-envelope-delete',
  imports: [
    RouterLink,
    HlmCardImports,
    HlmFieldImports,
    HlmButtonImports,
    HlmAlertImports,
    HlmSpinnerImports,
    HlmSelectImports,
    TranslocoModule,
  ],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>{{ 'envelopeDelete.title' | transloco }}</h1>
          <p hlmCardDescription>
            {{ 'envelopeDelete.description' | transloco: { name: envelope()?.name ?? '' } }}
          </p>
        </div>

        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              {{ 'envelopeDelete.loading' | transloco }}
            </div>
          } @else if (targetOptions().length === 0) {
            <div class="flex flex-col gap-4">
              <div hlmAlert>
                <p hlmAlertTitle>{{ 'envelopeDelete.noTargetTitle' | transloco }}</p>
                <p hlmAlertDescription>{{ 'envelopeDelete.noTargetDescription' | transloco }}</p>
              </div>
              <a hlmBtn variant="outline" [routerLink]="['/budget/envelopes', envelopeId()]">
                {{ 'envelopeDelete.cancel' | transloco }}
              </a>
            </div>
          } @else {
            <form (ngSubmit)="submit()" class="flex flex-col gap-4">
              <div hlmField>
                <label hlmFieldLabel>{{ 'envelopeDelete.targetEnvelope' | transloco }}</label>
                <hlm-select
                  [value]="targetEnvelopeId()"
                  (valueChange)="targetEnvelopeId.set($event ?? undefined)"
                  [itemToString]="envelopeToString"
                >
                  <hlm-select-trigger class="w-full">
                    <hlm-select-value [placeholder]="'envelopeDelete.chooseTarget' | transloco" />
                  </hlm-select-trigger>
                  <hlm-select-content *hlmSelectPortal>
                    @for (option of targetOptions(); track option.id) {
                      <hlm-select-item [value]="option.id">{{ option.name }}</hlm-select-item>
                    }
                  </hlm-select-content>
                </hlm-select>
                @if (submitted() && !targetEnvelopeId()) {
                  <hlm-field-error forceShow>{{
                    'envelopeDelete.chooseTargetError' | transloco
                  }}</hlm-field-error>
                }
              </div>

              @if (errorMessage()) {
                <div hlmAlert variant="destructive">
                  <p hlmAlertTitle>{{ 'envelopeDelete.errorTitle' | transloco }}</p>
                  <p hlmAlertDescription>{{ errorMessage() }}</p>
                </div>
              }

              <div class="flex flex-col gap-2">
                <button hlmBtn variant="destructive" type="submit" [disabled]="submitting()">
                  @if (submitting()) {
                    <hlm-spinner />
                    {{ 'envelopeDelete.deleting' | transloco }}
                  } @else {
                    {{ 'envelopeDelete.delete' | transloco }}
                  }
                </button>
                <a hlmBtn variant="ghost" [routerLink]="['/budget/envelopes', envelopeId()]">
                  {{ 'envelopeDelete.cancel' | transloco }}
                </a>
              </div>
            </form>
          }
        </div>
      </div>
    </div>
  `,
})
export class EnvelopeDelete {
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly envelope = signal<Envelope | null>(null);
  protected readonly targetEnvelopeId = signal<string | undefined>(undefined);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly envelopeId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  /** Every other envelope the history can be moved to (the one being deleted is excluded). */
  protected readonly targetOptions = computed(() =>
    this.budget.envelopes().filter((envelope) => envelope.id !== this.envelopeId()),
  );

  protected readonly envelopeToString = (id: string): string =>
    this.targetOptions().find((envelope) => envelope.id === id)?.name ?? '';

  constructor() {
    void this.loadInitialData();
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);

    const targetEnvelopeId = this.targetEnvelopeId();
    if (!targetEnvelopeId || this.submitting()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.budget.deleteEnvelope(this.envelopeId(), targetEnvelopeId);
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
      await this.router.navigateByUrl('/budget');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      const [envelope] = await Promise.all([
        this.budget.loadEnvelope(envelopeId),
        this.budget.loadEnvelopes(),
      ]);
      this.envelope.set(envelope);
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
