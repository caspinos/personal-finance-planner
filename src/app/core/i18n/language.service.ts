import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

const LANGUAGE_STORAGE_KEY = 'pfp.lang';

const LOCALE_TAGS: Record<string, string> = {
  en: 'en-US',
  pl: 'pl-PL',
};

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly activeLangSignal = signal(this.transloco.getActiveLang());

  readonly availableLangs = ['en', 'pl'] as const;
  readonly activeLang = this.activeLangSignal.asReadonly();
  readonly localeTag = computed(() => LOCALE_TAGS[this.activeLangSignal()] ?? 'en-US');

  setLanguage(lang: string): void {
    this.transloco.setActiveLang(lang);
    this.activeLangSignal.set(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  }
}
