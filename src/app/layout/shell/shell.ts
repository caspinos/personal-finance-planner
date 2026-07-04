import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet],
  template: `
    <header class="app-header">
      <span class="app-title">Personal Finance Planner</span>
      @if (auth.user(); as user) {
        <span class="user-email">{{ user.email }}</span>
      }
      <button type="button" (click)="signOut()">Sign out</button>
    </header>

    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .app-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid #ddd;
    }

    .app-title {
      font-weight: 600;
      margin-right: auto;
    }

    main {
      padding: 1rem;
    }
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
