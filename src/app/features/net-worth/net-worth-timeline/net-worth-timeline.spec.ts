import { NetWorthSummaryRow } from '../../../core/net-worth/net-worth.service';
import { columnTotal, monthOverMonthChanges, timelineCellValue } from './net-worth-timeline';

function row(overrides: Partial<NetWorthSummaryRow> = {}): NetWorthSummaryRow {
  return {
    account_id: 'account-1',
    account_name: 'Brokerage',
    account_type: 'investment',
    liquidity: 'liquid',
    category: null,
    currency: 'PLN',
    valuation_id: 'valuation-1',
    valued_on: '2026-05-31',
    last_valued_on: '2026-05-31',
    value: 5000,
    value_in_base: null,
    ...overrides,
  };
}

describe('timelineCellValue', () => {
  it('is empty when no valuation exists at or before the column', () => {
    expect(
      timelineCellValue(
        row({ valuation_id: null, valued_on: null, last_valued_on: null }),
        new Date(2026, 4, 1),
        false,
      ),
    ).toBeNull();

    expect(timelineCellValue(undefined, new Date(2026, 4, 1), false)).toBeNull();
  });

  it('carries a live account forward into months it was not re-valued in', () => {
    expect(timelineCellValue(row(), new Date(2026, 7, 1), false)).toBe(5000);
  });

  it('prefers the base-currency figure when one is available', () => {
    expect(timelineCellValue(row({ value_in_base: 4800 }), new Date(2026, 4, 1), false)).toBe(4800);
  });

  it('shows an archived account through the month it was last valued in', () => {
    expect(timelineCellValue(row(), new Date(2026, 4, 1), true)).toBe(5000);
  });

  it('keeps an archived account in the months before its last valuation', () => {
    const march = row({ valued_on: '2026-03-31', last_valued_on: '2026-05-31' });

    expect(timelineCellValue(march, new Date(2026, 2, 1), true)).toBe(5000);
  });

  it('drops an archived account after its last valuation, even on a non-zero balance', () => {
    // `get_net_worth_summary` carries the last valuation forward indefinitely,
    // so a closed account left holding 5000 would otherwise be added to every
    // later month's total for good.
    expect(timelineCellValue(row(), new Date(2026, 5, 1), true)).toBeNull();
    expect(timelineCellValue(row(), new Date(2027, 0, 1), true)).toBeNull();
  });

  it('keeps an archived account alive in a window that ends before its final valuation', () => {
    // Valued in Jan 2024 and again in Jan 2026, viewed through a 2025 window:
    // every row in that window carries the Jan 2024 valuation forward. Judging
    // the cut-off from those rows would read the account as finished in Jan
    // 2024 and blank out a year it was demonstrably still live.
    const carriedForward = row({ valued_on: '2024-01-31', last_valued_on: '2026-01-31' });

    expect(timelineCellValue(carriedForward, new Date(2025, 5, 1), true)).toBe(5000);
    expect(timelineCellValue(carriedForward, new Date(2025, 11, 1), true)).toBe(5000);
  });

  it('compares by month, not by day, so a mid-month valuation still counts', () => {
    const midMonth = row({ valued_on: '2026-05-15', last_valued_on: '2026-05-15' });

    expect(timelineCellValue(midMonth, new Date(2026, 4, 1), true)).toBe(5000);
  });

  it('orders months numerically across a year boundary', () => {
    const january = row({ valued_on: '2027-01-31', last_valued_on: '2027-01-31' });
    const september = row({ valued_on: '2026-09-30', last_valued_on: '2026-09-30' });

    expect(timelineCellValue(january, new Date(2027, 0, 1), true)).toBe(5000);
    expect(timelineCellValue(september, new Date(2026, 11, 1), true)).toBeNull();
  });
});

describe('columnTotal', () => {
  it('sums the months that have a figure', () => {
    expect(columnTotal([1000, null, -250])).toBe(750);
  });

  it('is unknown rather than zero when no account has a figure', () => {
    // A window reaching back before the first valuation would otherwise claim
    // a net worth of exactly zero, and the first recorded month would read as
    // a jump up from nothing.
    expect(columnTotal([null, null])).toBeNull();
    expect(columnTotal([])).toBeNull();
  });

  it('keeps a genuine zero apart from an unknown month', () => {
    expect(columnTotal([0, null])).toBe(0);
  });
});

describe('monthOverMonthChanges', () => {
  it('has no change for the first month of a window', () => {
    expect(monthOverMonthChanges([1000, 1200])).toEqual([null, 200]);
  });

  it('reports a fall as a negative change', () => {
    expect(monthOverMonthChanges([1000, 400])).toEqual([null, -600]);
  });

  it('skips a comparison across an unknown month', () => {
    expect(monthOverMonthChanges([null, 1000, 1500])).toEqual([null, null, 500]);
    expect(monthOverMonthChanges([1000, null, 1500])).toEqual([null, null, null]);
  });
});
