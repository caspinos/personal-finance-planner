import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { TranslocoModule } from '@jsverse/transloco';

import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, HlmButtonImports, TranslocoModule],
  template: `
    <div class="bg-background text-foreground flex min-h-svh flex-col">
      <header class="border-border flex items-center gap-4 border-b px-6 py-3">
        <span class="font-semibold">{{ 'shell.title' | transloco }}</span>
        <nav class="flex gap-2">
          <a hlmBtn variant="ghost" size="sm" routerLink="/">{{ 'shell.nav.dashboard' | transloco }}</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/budget">{{ 'shell.nav.budget' | transloco }}</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/net-worth">{{ 'shell.nav.netWorth' | transloco }}</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/rates">{{ 'shell.nav.rates' | transloco }}</a>
          <a hlmBtn variant="ghost" size="sm" routerLink="/household/members">{{ 'shell.nav.household' | transloco }}</a>
        </nav>
        <select
          class="border-input bg-background ml-auto rounded-md border px-2 py-1 text-sm"
          (change)="onLanguageChange($event)"
          aria-label="Language"
        >
          @for (lang of language.availableLangs; track lang) {
            <option [value]="lang" [selected]="lang === language.activeLang()">
              {{ lang.toUpperCase() }}
            </option>
          }
        </select>
        @if (auth.user(); as user) {
          <span class="text-muted-foreground text-sm">{{ user.email }}</span>
        }
        <button hlmBtn variant="outline" size="sm" type="button" (click)="signOut()">
          {{ 'shell.signOut' | transloco }}
        </button>
      </header>

      <main class="flex-1 p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected onLanguageChange(event: Event): void {
    this.language.setLanguage((event.target as HTMLSelectElement).value);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
