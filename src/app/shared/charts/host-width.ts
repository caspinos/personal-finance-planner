import { DestroyRef, ElementRef, Signal, inject, signal } from '@angular/core';

/**
 * Tracks the host element's own width so a chart can lay out in real CSS pixels.
 *
 * Scaling a fixed `viewBox` to the container would be less code, but it scales
 * the type with it: a 12px axis label ends up at 7px on a phone and 30px on a
 * wide screen. Measuring instead keeps every label at its intended size.
 *
 * `ResizeObserver` is missing in the unit-test DOM, so the fallback width stands
 * in there — the charts still render, just at a fixed size no test asserts on.
 */
export function hostWidth(fallback = 640): Signal<number> {
  const host = inject(ElementRef).nativeElement as HTMLElement;
  const width = signal(fallback);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;

      if (measured > 0) {
        width.set(measured);
      }
    });

    observer.observe(host);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  return width.asReadonly();
}
