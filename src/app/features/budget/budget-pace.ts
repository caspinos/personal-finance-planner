/**
 * Spending-pace maths for the envelope tiles.
 *
 * Two ratios drive the indicators painted behind a tile: how much of the
 * envelope's available budget has been consumed, and how much of the period has
 * elapsed. Comparing them answers the question the tile exists to answer -- am I
 * burning this envelope faster than the month is passing?
 *
 * Pure functions with no Angular or Date-of-today dependency, so the rules are
 * unit-testable without a component or a clock.
 */

/** An envelope's spending pace within one month. */
export interface EnvelopePace {
  /**
   * Whether the envelope had anything to spend at all. False means available
   * funds were zero or negative, so there is no meaningful denominator and the
   * ratios below degenerate to "nothing" or "everything".
   */
  readonly hasBudget: boolean;
  /** Share of the available budget consumed, uncapped (1.2 means 20% overspent). */
  readonly usedRatio: number;
  /** The same share clamped to [0, 1] -- what the fill bar is able to draw. */
  readonly fillRatio: number;
  /** `usedRatio` as whole percent, for labels. */
  readonly usedPercent: number;
  /** True when spending runs ahead of the clock: the wash turns amber. */
  readonly overPace: boolean;
}

/**
 * How much of `month` has passed as of `today`: 0 for a month still ahead, 1 for
 * one already over, and dayOfMonth / daysInMonth while it is running -- so the
 * marker sits at the end of the current day.
 */
export function monthElapsedRatio(month: Date, today: Date): number {
  const monthIndex = month.getFullYear() * 12 + month.getMonth();
  const todayIndex = today.getFullYear() * 12 + today.getMonth();

  if (todayIndex < monthIndex) {
    return 0;
  }

  if (todayIndex > monthIndex) {
    return 1;
  }

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return today.getDate() / daysInMonth;
}

/**
 * `spent` is what the envelope consumed during the month; `balance` is what is
 * left in it at the end of that month. Their sum is everything the envelope had
 * available -- carry-over from earlier months plus this month's top-ups and
 * transfers -- and that is what the fill is measured against, so a full bar
 * means the balance has reached zero.
 *
 * Transfers therefore move the denominator rather than the numerator: moving
 * money out of an envelope shrinks its budget, it does not count as spending.
 */
export function envelopePace(spent: number, balance: number, elapsedRatio: number): EnvelopePace {
  const consumed = Math.max(spent, 0);
  const available = consumed + balance;

  if (available <= 0) {
    // Nothing was ever available: either the envelope is untouched (show
    // nothing) or it was spent from with no funding behind it, which is past
    // any pace the calendar could excuse.
    const overspent = consumed > 0;
    return {
      hasBudget: false,
      usedRatio: overspent ? 1 : 0,
      fillRatio: overspent ? 1 : 0,
      usedPercent: overspent ? 100 : 0,
      overPace: overspent,
    };
  }

  const usedRatio = consumed / available;

  return {
    hasBudget: true,
    usedRatio,
    fillRatio: Math.min(usedRatio, 1),
    usedPercent: Math.round(usedRatio * 100),
    overPace: usedRatio > elapsedRatio,
  };
}
