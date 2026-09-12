import { envelopePace, monthElapsedRatio } from './budget-pace';

describe('monthElapsedRatio', () => {
  const june = new Date(2026, 5, 1);

  it('measures the running month by day of month', () => {
    expect(monthElapsedRatio(june, new Date(2026, 5, 15))).toBeCloseTo(0.5);
    expect(monthElapsedRatio(june, new Date(2026, 5, 30))).toBe(1);
    expect(monthElapsedRatio(june, new Date(2026, 5, 1))).toBeCloseTo(1 / 30);
  });

  it('treats a finished month as fully elapsed and a future one as untouched', () => {
    expect(monthElapsedRatio(june, new Date(2026, 6, 1))).toBe(1);
    expect(monthElapsedRatio(june, new Date(2027, 0, 10))).toBe(1);
    expect(monthElapsedRatio(june, new Date(2026, 4, 31))).toBe(0);
    expect(monthElapsedRatio(june, new Date(2025, 11, 31))).toBe(0);
  });
});

describe('envelopePace', () => {
  it('measures spending against everything the envelope had available', () => {
    // 400 spent with 600 still in the envelope: 1000 was available.
    const pace = envelopePace(400, 600, 0.5);

    expect(pace.hasBudget).toBe(true);
    expect(pace.usedRatio).toBeCloseTo(0.4);
    expect(pace.fillRatio).toBeCloseTo(0.4);
    expect(pace.usedPercent).toBe(40);
  });

  it('stays on track while usage trails the clock and flips once it leads', () => {
    expect(envelopePace(400, 600, 0.5).overPace).toBe(false);
    expect(envelopePace(600, 400, 0.5).overPace).toBe(true);
    // Exactly on pace is not yet over it.
    expect(envelopePace(500, 500, 0.5).overPace).toBe(false);
  });

  it('caps the fill at full while keeping the real ratio for the label', () => {
    // 150 spent out of 100 available leaves the envelope 50 in the red.
    const pace = envelopePace(150, -50, 0.5);

    expect(pace.usedRatio).toBeCloseTo(1.5);
    expect(pace.fillRatio).toBe(1);
    expect(pace.usedPercent).toBe(150);
    expect(pace.overPace).toBe(true);
  });

  it('reports no budget when the envelope never had funds to spend', () => {
    expect(envelopePace(0, 0, 0.5)).toEqual({
      hasBudget: false,
      usedRatio: 0,
      fillRatio: 0,
      usedPercent: 0,
      overPace: false,
    });

    // Spending with no funding behind it: full amber, no meaningful percentage.
    expect(envelopePace(200, -200, 0.9)).toEqual({
      hasBudget: false,
      usedRatio: 1,
      fillRatio: 1,
      usedPercent: 100,
      overPace: true,
    });
  });

  it('shows a finished month as on track unless it was overspent', () => {
    expect(envelopePace(1000, 0, 1).overPace).toBe(false);
    expect(envelopePace(1000, -100, 1).overPace).toBe(true);
  });
});
