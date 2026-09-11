/**
 * Geometry helpers shared by the hand-rolled SVG charts.
 *
 * The app has no charting dependency, so the few charts it needs are drawn
 * directly. Keeping the arithmetic here — pure, unit-tested, free of any DOM —
 * leaves the components with nothing but markup.
 */

/** One plotted observation. `value` is `null` where the series has no figure yet. */
export interface ChartPoint {
  label: string;
  value: number | null;
}

export interface ChartScale {
  min: number;
  max: number;
  /** Clean values to draw gridlines and y-axis labels at, ascending. */
  ticks: number[];
}

/**
 * Rounds `rough` up to the nearest 1, 2, 5 or 10 times a power of ten, so tick
 * labels land on numbers a reader recognises (500 / 1,000 / 2,000) rather than
 * on whatever the data range divided by four happens to be.
 */
export function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) {
    return 1;
  }

  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const stepped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

  return stepped * magnitude;
}

/**
 * Builds a y-axis domain that covers `values` and ends on clean tick values.
 *
 * `includeZero` forces the baseline into the domain: bars must grow from zero
 * to stay honest, whereas a line may sit on a padded range so a small movement
 * in a large balance is still visible.
 */
export function niceScale(
  values: Array<number | null>,
  options: { includeZero?: boolean; tickCount?: number } = {},
): ChartScale {
  const { includeZero = false, tickCount = 4 } = options;
  const finite = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );

  if (finite.length === 0) {
    return { min: 0, max: 1, ticks: [0, 1] };
  }

  let low = Math.min(...finite);
  let high = Math.max(...finite);

  if (includeZero || low < 0) {
    low = Math.min(low, 0);
    high = Math.max(high, 0);
  }

  if (low === high) {
    // A flat series still needs a domain to draw in; centre it on the value.
    const padding = low === 0 ? 1 : Math.abs(low) * 0.1;
    low -= padding;
    high += padding;

    if (includeZero) {
      low = Math.min(low, 0);
      high = Math.max(high, 0);
    }
  }

  const step = niceStep((high - low) / Math.max(1, tickCount));
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  const ticks: number[] = [];

  // Accumulating `min + i * step` keeps the rounding error from compounding the
  // way repeated `+= step` would, which otherwise yields ticks like 0.30000000004.
  for (let i = 0; min + i * step <= max + step / 1000; i++) {
    ticks.push(Number((min + i * step).toFixed(decimals)));
  }

  return { min, max, ticks };
}

/**
 * Groups indices into runs of consecutive entries that actually have a value,
 * e.g. `[100, null, 200, 300]` -> `[[0], [2, 3]]`.
 *
 * Every mark that spans more than one observation -- a line segment, a band of
 * area fill -- has to be built per run. Drawing one across the whole series
 * instead would bridge the months with no figure and imply a value that was
 * never recorded.
 */
export function definedRuns(values: Array<number | null>): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];

  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
      return;
    }

    current.push(index);
  });

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
}

/** Maps a value in `scale` onto a y coordinate inside a plot box. */
export function scaleY(value: number, scale: ChartScale, top: number, height: number): number {
  const span = scale.max - scale.min;

  if (span === 0) {
    return top + height;
  }

  return top + height * (1 - (value - scale.min) / span);
}

/**
 * X centre of slot `index` of `count`, so points and bars share one band layout:
 * the series is inset by half a band at each end, which keeps the first and last
 * marks off the plot edge.
 */
export function bandCenter(index: number, count: number, left: number, width: number): number {
  if (count <= 0) {
    return left;
  }

  if (count === 1) {
    return left + width / 2;
  }

  const band = width / count;
  return left + band * (index + 0.5);
}

/**
 * A column with its data-end rounded and its baseline end square, drawn from
 * `baseline` to `end` so the same helper covers bars above and below zero.
 */
export function columnPath(
  centerX: number,
  baselineY: number,
  endY: number,
  width: number,
  radius: number,
): string {
  const half = width / 2;
  const left = centerX - half;
  const right = centerX + half;
  const height = Math.abs(endY - baselineY);
  const pointsUp = endY <= baselineY;
  const r = Math.min(radius, half, height);

  if (height === 0) {
    return `M ${left} ${baselineY} L ${right} ${baselineY}`;
  }

  if (pointsUp) {
    return [
      `M ${left} ${baselineY}`,
      `L ${left} ${endY + r}`,
      `A ${r} ${r} 0 0 1 ${left + r} ${endY}`,
      `L ${right - r} ${endY}`,
      `A ${r} ${r} 0 0 1 ${right} ${endY + r}`,
      `L ${right} ${baselineY}`,
      'Z',
    ].join(' ');
  }

  return [
    `M ${left} ${baselineY}`,
    `L ${left} ${endY - r}`,
    `A ${r} ${r} 0 0 0 ${left + r} ${endY}`,
    `L ${right - r} ${endY}`,
    `A ${r} ${r} 0 0 0 ${right} ${endY - r}`,
    `L ${right} ${baselineY}`,
    'Z',
  ].join(' ');
}

/**
 * How many slots to skip between x-axis labels so they do not collide. Twelve
 * month headings do not fit across a phone, so every second or third one is
 * dropped rather than letting them overlap or shrink out of legibility.
 */
export function labelStride(count: number, width: number, labelWidth: number): number {
  if (count <= 1 || width <= 0) {
    return 1;
  }

  return Math.max(1, Math.ceil((count * labelWidth) / width));
}
