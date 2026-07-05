import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { HouseholdService } from '../../../core/household/household.service';

@Component({
  selector: 'app-accept-invite',
  imports: [RouterLink, HlmAlertImports, HlmButtonImports, HlmCardImports, HlmSpinnerImports],
  template: `
    <div class="flex min-h-svh items-center justify-center p-6">
      <div hlmCard class="w-full max-w-sm">
        <div hlmCardHeader>
          <h1 hlmCardTitle>Joining household</h1>
          <p hlmCardDescription>Redeeming your invite link.</p>
        </div>

        <div hlmCardContent class="flex flex-col gap-4">
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Accepting invite...
            </div>
          } @else if (errorMessage()) {
            <div hlmAlert variant="destructive">
              <p hlmAlertTitle>Couldn't accept this invite</p>
              <p hlmAlertDescription>{{ errorMessage() }}</p>
            </div>
            <a hlmBtn variant="outline" size="sm" routerLink="/">Back to dashboard</a>
          }
        </div>
      </div>
    </div>
  `,
})
export class AcceptInvite {
  private readonly households = inject(HouseholdService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.accept();
  }

  private async accept(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.loading.set(false);
      this.errorMessage.set('This invite link is missing a token.');
      return;
    }

    try {
      await this.households.acceptInvite(token);
      await this.router.navigateByUrl('/');
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
