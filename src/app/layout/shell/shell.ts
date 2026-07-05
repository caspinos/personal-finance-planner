import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { TranslocoModule } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMenu, lucideX } from '@ng-icons/lucide';

import { AuthService } from '../../core/auth/auth.service';
import { LanguageService } from '../../core/i18n/language.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, HlmButtonImports, TranslocoModule, NgIcon],
  providers: [provideIcons({ lucideMenu, lucideX })],
  template: `
    <div class="bg-background text-foreground flex min-h-svh flex-col">
      <header class="border-border border-b">
        <div class="flex items-center gap-4 px-4 py-3 sm:px-6">
          <span class="font-semibold">{{ 'shell.title' | transloco }}</span>

          <nav class="hidden gap-2 sm:flex">
            <a hlmBtn variant="ghost" size="sm" routerLink="/">{{ 'shell.nav.dashboard' | transloco }}</a>
            <a hlmBtn variant="ghost" size="sm" routerLink="/budget">{{ 'shell.nav.budget' | transloco }}</a>
            <a hlmBtn variant="ghost" size="sm" routerLink="/net-worth">{{
              'shell.nav.netWorth' | transloco
            }}</a>
            <a hlmBtn variant="ghost" size="sm" routerLink="/rates">{{ 'shell.nav.rates' | transloco }}</a>
            <a hlmBtn variant="ghost" size="sm" routerLink="/household/members">{{
              'shell.nav.household' | transloco
            }}</a>
          </nav>

          <select
            class="border-input bg-background ml-auto hidden rounded-md border px-2 py-1 text-sm sm:ml-auto sm:block"
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
            <span class="text-muted-foreground hidden text-sm sm:inline">{{ user.email }}</span>
          }
          <button hlmBtn variant="outline" size="sm" type="button" class="hidden sm:inline-flex" (click)="signOut()">
            {{ 'shell.signOut' | transloco }}
          </button>

          <button
            hlmBtn
            variant="ghost"
            size="sm"
            type="button"
            class="ml-auto sm:hidden"
            [attr.aria-expanded]="mobileMenuOpen()"
            aria-label="Menu"
            (click)="toggleMobileMenu()"
          >
            <ng-icon [name]="mobileMenuOpen() ? 'lucideX' : 'lucideMenu'" size="20" />
          </button>
        </div>

        @if (mobileMenuOpen()) {
          <div class="border-border flex flex-col gap-3 border-t px-4 py-3 sm:hidden">
            <nav class="flex flex-col gap-1">
              <a hlmBtn variant="ghost" size="sm" class="justify-start" routerLink="/" (click)="closeMobileMenu()">{{
                'shell.nav.dashboard' | transloco
              }}</a>
              <a
                hlmBtn
                variant="ghost"
                size="sm"
                class="justify-start"
                routerLink="/budget"
                (click)="closeMobileMenu()"
                >{{ 'shell.nav.budget' | transloco }}</a
              >
              <a
                hlmBtn
                variant="ghost"
                size="sm"
                class="justify-start"
                routerLink="/net-worth"
                (click)="closeMobileMenu()"
                >{{ 'shell.nav.netWorth' | transloco }}</a
              >
              <a
                hlmBtn
                variant="ghost"
                size="sm"
                class="justify-start"
                routerLink="/rates"
                (click)="closeMobileMenu()"
                >{{ 'shell.nav.rates' | transloco }}</a
              >
              <a
                hlmBtn
                variant="ghost"
                size="sm"
                class="justify-start"
                routerLink="/household/members"
                (click)="closeMobileMenu()"
                >{{ 'shell.nav.household' | transloco }}</a
              >
            </nav>
            <select
              class="border-input bg-background rounded-md border px-2 py-1 text-sm"
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
          </div>
        }
      </header>

      <main class="flex-1 p-4 sm:p-6">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly mobileMenuOpen = signal(false);

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected onLanguageChange(event: Event): void {
    this.language.setLanguage((event.target as HTMLSelectElement).value);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
