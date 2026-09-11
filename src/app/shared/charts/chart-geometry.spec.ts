import {
  bandCenter,
  columnPath,
  definedRuns,
  labelStride,
  niceScale,
  niceStep,
  scaleY,
} from './chart-geometry';

describe('niceStep', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceStep(0.3)).toBe(0.5);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.4)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(23_000)).toBe(50_000);
  });

  it('falls back to 1 for a degenerate range', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(Number.NaN)).toBe(1);
  });
});

describe('niceScale', () => {
  it('covers the data and ends on clean ticks', () => {
    const scale = niceScale([1200, 4800, 3100]);

    expect(scale.min).toBeLessThanOrEqual(1200);
    expect(scale.max).toBeGreaterThanOrEqual(4800);
    expect(scale.ticks[0]).toBe(scale.min);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
  });

  it('ignores months that have no figure', () => {
    expect(niceScale([null, 100, null])).toEqual(niceScale([100]));
  });

  it('pulls the baseline in when asked, so bars grow from zero', () => {
    expect(niceScale([1200, 4800], { includeZero: true }).min).toBe(0);
  });

  it('includes zero unasked when the data crosses it, so the sign is visible', () => {
    const scale = niceScale([-500, 1500]);

    expect(scale.min).toBeLessThanOrEqual(-500);
    expect(scale.max).toBeGreaterThanOrEqual(1500);
    expect(scale.ticks).toContain(0);
  });

  it('gives a flat series a domain to draw in', () => {
    const scale = niceScale([5000, 5000]);

    expect(scale.max).toBeGreaterThan(scale.min);
  });

  it('has a usable domain with no data at all', () => {
    expect(niceScale([])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
    expect(niceScale([null, null])).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it('keeps tick labels free of floating point noise', () => {
    for (const tick of niceScale([0, 1]).ticks) {
      expect(String(tick)).not.toMatch(/\d{6,}/);
    }
  });
});

describe('scaleY', () => {
  it('puts the domain maximum at the top of the plot and the minimum at the bottom', () => {
    const scale = { min: 0, max: 100, ticks: [0, 50, 100] };

    expect(scaleY(100, scale, 10, 200)).toBe(10);
    expect(scaleY(0, scale, 10, 200)).toBe(210);
    expect(scaleY(50, scale, 10, 200)).toBe(110);
  });

  it('does not divide by an empty domain', () => {
    expect(scaleY(5, { min: 5, max: 5, ticks: [5] }, 10, 200)).toBe(210);
  });
});

describe('bandCenter', () => {
  it('insets the series by half a band so end marks stay off the plot edge', () => {
    expect(bandCenter(0, 4, 0, 400)).toBe(50);
    expect(bandCenter(3, 4, 0, 400)).toBe(350);
  });

  it('centres a lone point', () => {
    expect(bandCenter(0, 1, 0, 400)).toBe(200);
  });
});

describe('columnPath', () => {
  it('rounds the data end and leaves the baseline end square', () => {
    const up = columnPath(100, 200, 100, 20, 4);

    // Both baseline corners are drawn at the baseline y, unrounded.
    expect(up).toContain('M 90 200');
    expect(up).toContain('L 110 200');
    expect(up).toContain('A 4 4');
  });

  it('draws downwards for a negative value', () => {
    const down = columnPath(100, 100, 180, 20, 4);

    expect(down).toContain('M 90 100');
    expect(down).toContain('A 4 4 0 0 0');
  });

  it('never rounds by more than the column has room for', () => {
    // A 1px-tall column would otherwise be drawn with 4px corners and invert.
    expect(columnPath(100, 200, 199, 20, 4)).toContain('A 1 1');
  });

  it('degenerates to a flat line at zero height', () => {
    expect(columnPath(100, 200, 200, 20, 4)).toBe('M 90 200 L 110 200');
  });
});

describe('labelStride', () => {
  it('labels every slot when they all fit', () => {
    expect(labelStride(12, 900, 42)).toBe(1);
  });

  it('drops labels rather than letting them collide on a narrow chart', () => {
    expect(labelStride(12, 240, 42)).toBe(3);
  });

  it('stays at one for a degenerate chart', () => {
    expect(labelStride(1, 0, 42)).toBe(1);
    expect(labelStride(12, 0, 42)).toBe(1);
  });
});

describe('definedRuns', () => {
  it('keeps an unbroken series as one run', () => {
    expect(definedRuns([100, 200, 300])).toEqual([[0, 1, 2]]);
  });

  it('splits at a month with no figure, so no mark spans the gap', () => {
    // A line or an area drawn straight across index 1 would imply a value
    // that was never recorded.
    expect(definedRuns([100, null, 200, 300])).toEqual([[0], [2, 3]]);
  });

  it('drops leading and trailing gaps rather than emitting empty runs', () => {
    expect(definedRuns([null, 100, 200, null])).toEqual([[1, 2]]);
    expect(definedRuns([null, null])).toEqual([]);
    expect(definedRuns([])).toEqual([]);
  });

  it('reports a lone observation as its own single-index run', () => {
    expect(definedRuns([null, 100, null])).toEqual([[1]]);
  });
});
