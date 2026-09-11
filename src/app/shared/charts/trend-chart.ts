import { Component, LOCALE_ID, computed, inject, input, signal } from '@angular/core';

import { ChartPoint, bandCenter, labelStride, niceScale, scaleY } from './chart-geometry';
import { hostWidth } from './host-width';

const TOP = 14;
const RIGHT = 12;
const BOTTOM = 24;
/** Widest a y-axis label is allowed to get before the plot stops shrinking for it. */
const MAX_AXIS_LABEL = 64;

/**
 * A single-series line with a wash of area fill underneath — the default form
 * for a trend over time. One series means no legend: whatever card the chart
 * sits in names what is plotted.
 *
 * Gaps in the series (a month with no figure at all) break the line rather than
 * being interpolated across, so an unrecorded month never reads as a value.
 */
@Component({
  selector: 'app-trend-chart',
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

      @if (areaPath()) {
        <path [attr.d]="areaPath()" fill="var(--primary)" fill-opacity="0.1" />
      }
      @for (segment of linePaths(); track $index) {
        <path
          [attr.d]="segment"
          fill="none"
          stroke="var(--primary)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      }

      @if (lastPoint(); as last) {
        <circle
          [attr.cx]="last.x"
          [attr.cy]="last.y"
          r="4"
          fill="var(--primary)"
          stroke="var(--card)"
          stroke-width="2"
        />
      }

      @for (mark of marks(); track mark.index) {
        @if (mark.index === hovered()) {
          <line
            [attr.x1]="mark.x"
            [attr.x2]="mark.x"
            [attr.y1]="TOP"
            [attr.y2]="height() - BOTTOM"
            stroke="var(--muted-foreground)"
            stroke-width="1"
          />
          @if (mark.y !== null) {
            <circle
              [attr.cx]="mark.x"
              [attr.cy]="mark.y"
              r="4"
              fill="var(--primary)"
              stroke="var(--card)"
              stroke-width="2"
            />
          }
        }
        @if (mark.showLabel) {
          <text
            [attr.x]="mark.x"
            [attr.y]="height() - 6"
            text-anchor="middle"
            class="fill-muted-foreground text-[11px]"
          >
            {{ mark.label }}
          </text>
        }
      }

      @for (mark of marks(); track mark.index) {
        <rect
          [attr.x]="mark.x - bandWidth() / 2"
          [attr.y]="TOP"
          [attr.width]="bandWidth()"
          [attr.height]="height() - TOP - BOTTOM"
          fill="transparent"
          (pointerenter)="hovered.set(mark.index)"
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
export class TrendChart {
  /**
   * Figures are formatted with the app's locale rather than the chosen language,
   * so a chart label groups its digits exactly like the `number` pipe does in the
   * table beside it.
   */
  private readonly locale = inject(LOCALE_ID);

  readonly points = input.required<ChartPoint[]>();
  readonly height = input(200);
  /** Appended to each formatted figure in the tooltip, e.g. the base currency. */
  readonly unit = input('');
  /** Describes the whole chart for screen readers; the data table carries the detail. */
  readonly ariaLabel = input('');

  protected readonly TOP = TOP;
  protected readonly RIGHT = RIGHT;
  protected readonly BOTTOM = BOTTOM;

  protected readonly hovered = signal<number | null>(null);
  protected readonly width = hostWidth();

  private readonly scale = computed(() =>
    niceScale(
      this.points().map((point) => point.value),
      { tickCount: 4 },
    ),
  );

  private readonly compactFormat = computed(
    () =>
      new Intl.NumberFormat(this.locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
  );

  private readonly fullFormat = computed(
    () => new Intl.NumberFormat(this.locale, { maximumFractionDigits: 0 }),
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

  protected readonly gridlines = computed(() =>
    this.scale().ticks.map((tick) => ({
      value: tick,
      y: scaleY(tick, this.scale(), TOP, this.plotHeight()),
      label: this.compactFormat().format(tick),
    })),
  );

  protected readonly marks = computed(() => {
    const points = this.points();
    const stride = labelStride(points.length, this.plotWidth(), 42);

    return points.map((point, index) => ({
      index,
      label: point.label,
      // Stride from the right so the most recent month always keeps its label.
      showLabel: (points.length - 1 - index) % stride === 0,
      x: bandCenter(index, points.length, this.left(), this.plotWidth()),
      y: point.value === null ? null : scaleY(point.value, this.scale(), TOP, this.plotHeight()),
    }));
  });

  /** One path per run of consecutive months that actually have a figure. */
  protected readonly linePaths = computed(() => {
    const segments: string[] = [];
    let current: string[] = [];

    for (const mark of this.marks()) {
      if (mark.y === null) {
        if (current.length > 1) {
          segments.push(current.join(' '));
        }
        current = [];
        continue;
      }

      current.push(`${current.length === 0 ? 'M' : 'L'} ${mark.x} ${mark.y}`);
    }

    if (current.length > 1) {
      segments.push(current.join(' '));
    }

    return segments;
  });

  /**
   * Only drawn when zero is inside the domain. A line may sit on a padded range
   * -- that is how a small move in a large balance stays visible -- but filling
   * underneath it would then read as area-from-nothing and overstate the growth.
   */
  protected readonly areaPath = computed(() => {
    const scale = this.scale();
    const plotted = this.marks().filter((mark) => mark.y !== null);

    if (plotted.length < 2 || scale.min > 0 || scale.max < 0) {
      return '';
    }

    const baseline = scaleY(0, scale, TOP, this.plotHeight());
    const top = plotted.map((mark, index) => `${index === 0 ? 'M' : 'L'} ${mark.x} ${mark.y}`);

    return [
      ...top,
      `L ${plotted[plotted.length - 1].x} ${baseline}`,
      `L ${plotted[0].x} ${baseline}`,
      'Z',
    ].join(' ');
  });

  protected readonly lastPoint = computed(() => {
    const plotted = this.marks().filter((mark) => mark.y !== null);
    return plotted.length > 0 ? plotted[plotted.length - 1] : null;
  });

  protected readonly tooltip = computed(() => {
    const index = this.hovered();

    if (index === null) {
      return null;
    }

    const mark = this.marks()[index];
    const point = this.points()[index];

    if (!mark || !point || point.value === null) {
      return null;
    }

    return {
      // Clamped so a tooltip on the first or last month stays inside the card.
      x: Math.min(Math.max(mark.x, 56), Math.max(56, this.width() - 56)),
      label: point.label,
      value: `${this.fullFormat().format(point.value)} ${this.unit()}`.trim(),
    };
  });
}
