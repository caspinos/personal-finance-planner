import { Component, computed, input } from '@angular/core';

import { hlm } from '@spartan-ng/helm/utils';

/**
 * App brand mark: ascending bars with a trending-up arrow on a rounded tile.
 * Same geometry as the favicon in `public/icon.svg`, but drawn with theme
 * tokens so it follows light/dark mode. Decorative — it is always paired with
 * the app name or a heading.
 */
@Component({
  selector: 'app-logo',
  template: `
    <span [class]="tileClass()" aria-hidden="true">
      <svg class="size-full" viewBox="0 0 32 32" fill="none" focusable="false">
        <g fill="currentColor" fill-opacity=".45">
          <rect x="6" y="18" width="5" height="7" rx="1.5" />
          <rect x="13.5" y="14.5" width="5" height="10.5" rx="1.5" />
          <rect x="21" y="11.5" width="5" height="13.5" rx="1.5" />
        </g>
        <g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 17 L16 12.5 L23.5 8.5" />
          <path d="M19.5 8.5 H23.5 V12" />
        </g>
      </svg>
    </span>
  `,
})
export class AppLogo {
  readonly size = input<'sm' | 'lg'>('sm');

  protected readonly tileClass = computed(() =>
    hlm(
      'bg-primary text-primary-foreground inline-flex shrink-0 items-center justify-center',
      this.size() === 'lg' ? 'size-12 rounded-xl' : 'size-8 rounded-lg',
    ),
  );
}
