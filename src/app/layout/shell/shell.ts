import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { TranslocoModule } from '@jsverse/transloco';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMenu, lucidePlus, lucideX } from '@ng-icons/lucide';

import { AuthService } from '../../core/auth/auth.service';
import { HouseholdService } from '../../core/household/household.service';
import { LanguageService } from '../../core/i18n/language.service';
import { AppLogo } from '../app-logo/app-logo';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, HlmButtonImports, TranslocoModule, NgIcon, AppLogo],
  providers: [provideIcons({ lucideMenu, lucidePlus, lucideX })],
  template: `
    <div class="bg-background text-foreground flex min-h-svh flex-col">
      <header class="border-border border-b">
        <div class="flex items-center gap-4 px-4 py-3 sm:px-6">
          <span class="flex items-center gap-2">
            <app-logo />
            <span class="font-semibold">{{ 'shell.title' | transloco }}</span>
          </span>

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

          <div class="ml-auto hidden items-center gap-2 sm:flex">
            @if (households.hasMultipleHouseholds()) {
              <select
                class="border-input bg-background rounded-md border px-2 py-1 text-sm"
                [attr.aria-label]="'shell.household' | transloco"
                (change)="onHouseholdChange($event)"
              >
                @for (household of households.households(); track household.id) {
                  <option [value]="household.id" [selected]="household.id === currentHouseholdId()">
                    {{ household.name }}
                  </option>
                }
              </select>
            } @else if (households.currentHousehold(); as household) {
              <span class="text-muted-foreground text-sm">{{ household.name }}</span>
            }
            <a
              hlmBtn
              variant="ghost"
              size="sm"
              routerLink="/household/create"
              [attr.aria-label]="'shell.newHousehold' | transloco"
              [title]="'shell.newHousehold' | transloco"
            >
              <ng-icon name="lucidePlus" size="16" />
            </a>
          </div>

          <select
            class="border-input bg-background hidden rounded-md border px-2 py-1 text-sm sm:block"
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

            @if (households.hasMultipleHouseholds()) {
              <select
                class="border-input bg-background rounded-md border px-2 py-1 text-sm"
                [attr.aria-label]="'shell.household' | transloco"
                (change)="onHouseholdChange($event)"
              >
                @for (household of households.households(); track household.id) {
                  <option [value]="household.id" [selected]="household.id === currentHouseholdId()">
                    {{ household.name }}
                  </option>
                }
              </select>
            } @else if (households.currentHousehold(); as household) {
              <span class="text-muted-foreground text-sm">{{ household.name }}</span>
            }
            <a
              hlmBtn
              variant="ghost"
              size="sm"
              class="justify-start"
              routerLink="/household/create"
              (click)="closeMobileMenu()"
              >{{ 'shell.newHousehold' | transloco }}</a
            >

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
  protected readonly households = inject(HouseholdService);
  protected readonly language = inject(LanguageService);
  private readonly router = inject(Router);

  protected readonly mobileMenuOpen = signal(false);
  protected readonly currentHouseholdId = computed(
    () => this.households.currentHousehold()?.id ?? null,
  );

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected onHouseholdChange(event: Event): void {
    const householdId = (event.target as HTMLSelectElement).value;
    if (householdId !== this.currentHouseholdId()) {
      this.households.switchHousehold(householdId);
    }
  }

  protected onLanguageChange(event: Event): void {
    this.language.setLanguage((event.target as HTMLSelectElement).value);
  }

  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}
