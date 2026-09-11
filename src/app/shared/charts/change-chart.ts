import { Component, LOCALE_ID, computed, inject, input, signal } from '@angular/core';

import {
  ChartPoint,
  bandCenter,
  columnPath,
  labelStride,
  niceScale,
  scaleY,
} from './chart-geometry';
import { hostWidth } from './host-width';

const TOP = 14;
const RIGHT = 12;
const BOTTOM = 24;
const MAX_AXIS_LABEL = 64;
const MAX_BAR_WIDTH = 24;
/** Surface gap between neighbouring columns, so touching bars stay separate. */
const BAR_GAP = 2;

/**
 * Columns growing out of a zero baseline, coloured by direction.
 *
 * Direction is carried by which side of the baseline a column sits on, so the
 * colour only reinforces what the position already says — it is never the sole
 * channel. Periods with no comparison (the first month in a window) draw
 * nothing rather than a zero-height bar, which would read as "no change".
 */
@Component({
  selector: 'app-change-chart',
  imports: [],
  host: { class: 'relative block' },
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      role="img"
      [attr.aria-label]="ariaLabel()"
      class="max-w-full overflow-visible"
      (pointerleave)="hovered.set(null)"
    >
      @for (tick of gridlines(); track tick.value) {
        <line
          [attr.x1]="left()"
          [attr.x2]="width() - RIGHT"
          [attr.y1]="tick.y"
          [attr.y2]="tick.y"
          [attr.stroke]="tick.value === 0 ? 'var(--muted-foreground)' : 'var(--border)'"
          stroke-width="1"
        />
        <text
          [attr.x]="left() - 8"
          [attr.y]="tick.y + 4"
          text-anchor="end"
          class="fill-muted-foreground text-[11px] tabular-nums"
        >
          {{ tick.label }}
        </text>
      }

      @for (bar of bars(); track bar.index) {
        @if (bar.path) {
          <path
            [attr.d]="bar.path"
            [attr.fill]="bar.negative ? 'var(--destructive)' : 'var(--primary)'"
            [attr.fill-opacity]="hovered() === null || hovered() === bar.index ? 1 : 0.45"
          />
        }
        @if (bar.showLabel) {
          <text
            [attr.x]="bar.x"
            [attr.y]="height() - 6"
            text-anchor="middle"
            class="fill-muted-foreground text-[11px]"
          >
            {{ bar.label }}
          </text>
        }
        <rect
          [attr.x]="bar.x - bandWidth() / 2"
          [attr.y]="TOP"
          [attr.width]="bandWidth()"
          [attr.height]="height() - TOP - BOTTOM"
          fill="transparent"
          (pointerenter)="hovered.set(bar.index)"
        />
      }
    </svg>

    @if (tooltip(); as tip) {
      <div
        class="bg-popover text-popover-foreground border-border pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border px-2 py-1 text-xs shadow-sm"
        [style.left.px]="tip.x"
        role="status"
      >
        <span class="text-muted-foreground block">{{ tip.label }}</span>
        <span class="block font-medium tabular-nums">{{ tip.value }}</span>
      </div>
    }
  `,
})
export class ChangeChart {
  /**
   * Figures are formatted with the app's locale rather than the chosen language,
   * so a chart label groups its digits exactly like the `number` pipe does in the
   * table beside it.
   */
  private readonly locale = inject(LOCALE_ID);

  readonly points = input.required<ChartPoint[]>();
  readonly height = input(200);
  readonly unit = input('');
  readonly ariaLabel = input('');

  protected readonly TOP = TOP;
  protected readonly RIGHT = RIGHT;
  protected readonly BOTTOM = BOTTOM;

  protected readonly hovered = signal<number | null>(null);
  protected readonly width = hostWidth();

  private readonly scale = computed(() =>
    niceScale(
      this.points().map((point) => point.value),
      { includeZero: true, tickCount: 3 },
    ),
  );

  private readonly compactFormat = computed(
    () =>
      new Intl.NumberFormat(this.locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
  );

  private readonly signedFormat = computed(
    () =>
      new Intl.NumberFormat(this.locale, {
        maximumFractionDigits: 0,
        signDisplay: 'exceptZero',
      }),
  );

  protected readonly left = computed(() => {
    const widest = Math.max(
      ...this.scale().ticks.map((tick) => this.compactFormat().format(tick).length),
      1,
    );

    return Math.min(MAX_AXIS_LABEL, widest * 7 + 12);
  });

  private readonly plotWidth = computed(() => Math.max(0, this.width() - this.left() - RIGHT));
  private readonly plotHeight = computed(() => Math.max(0, this.height() - TOP - BOTTOM));

  protected readonly bandWidth = computed(() =>
    this.points().length > 0 ? this.plotWidth() / this.points().length : 0,
  );

  private readonly baselineY = computed(() => scaleY(0, this.scale(), TOP, this.plotHeight()));

  protected readonly gridlines = computed(() =>
    this.scale().ticks.map((tick) => ({
      value: tick,
      y: scaleY(tick, this.scale(), TOP, this.plotHeight()),
      label: this.compactFormat().format(tick),
    })),
  );

  protected readonly bars = computed(() => {
    const points = this.points();
    const stride = labelStride(points.length, this.plotWidth(), 42);
    const barWidth = Math.max(2, Math.min(MAX_BAR_WIDTH, this.bandWidth() - BAR_GAP));

    return points.map((point, index) => {
      const x = bandCenter(index, points.length, this.left(), this.plotWidth());

      return {
        index,
        label: point.label,
        showLabel: (points.length - 1 - index) % stride === 0,
        x,
        negative: (point.value ?? 0) < 0,
        path:
          point.value === null
            ? ''
            : columnPath(
                x,
                this.baselineY(),
                scaleY(point.value, this.scale(), TOP, this.plotHeight()),
                barWidth,
                4,
              ),
      };
    });
  });

  protected readonly tooltip = computed(() => {
    const index = this.hovered();

    if (index === null) {
      return null;
    }

    const bar = this.bars()[index];
    const point = this.points()[index];

    if (!bar || !point || point.value === null) {
      return null;
    }

    return {
      x: Math.min(Math.max(bar.x, 56), Math.max(56, this.width() - 56)),
      label: point.label,
      value: `${this.signedFormat().format(point.value)} ${this.unit()}`.trim(),
    };
  });
}
