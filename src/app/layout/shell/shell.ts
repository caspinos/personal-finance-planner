import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, HlmButtonImports],
  template: `
    <div class="bg-background text-foreground flex min-h-svh flex-col">
      <header class="border-border flex items-center gap-4 border-b px-6 py-3">
        <span class="font-semibold">Personal Finance Planner</span>
        <nav class="flex gap-2">
          <a hlmBtn variant="ghost" size="sm" routerLink="/">Dashboard</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget">Budget</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/net-worth">Net worth</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/rates">Rates</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/household/members">Household</a>
        </nav>
        @if (auth.user(); as user) {
          <span class="text-muted-foreground ml-auto text-sm">{{ user.email }}</span>
        }
        <button hlmBtn variant="outline" size="sm" type="button" (click)="signOut()">Sign out</button>
      </header>

      <main class="flex-1 p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
