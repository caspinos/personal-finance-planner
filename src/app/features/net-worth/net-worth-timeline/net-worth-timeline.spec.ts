import { NetWorthSummaryRow } from '../../../core/net-worth/net-worth.service';
import { timelineCellValue } from './net-worth-timeline';

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
    value: 5000,
    signed_value: 5000,
    value_in_base: null,
    signed_value_in_base: null,
    ...overrides,
  };
}

describe('timelineCellValue', () => {
  it('is empty when no valuation exists at or before the column', () => {
    expect(
      timelineCellValue(row({ valuation_id: null, valued_on: null }), new Date(2026, 4, 1), {
        archived: false,
        lastValuedMonth: undefined,
      }),
    ).toBeNull();

    expect(
      timelineCellValue(undefined, new Date(2026, 4, 1), {
        archived: false,
        lastValuedMonth: undefined,
      }),
    ).toBeNull();
  });

  it('carries a live account forward into months it was not re-valued in', () => {
    const august = timelineCellValue(row(), new Date(2026, 7, 1), {
      archived: false,
      lastValuedMonth: '2026-05',
    });

    expect(august).toBe(5000);
  });

  it('prefers the base-currency figure when one is available', () => {
    const value = timelineCellValue(row({ signed_value_in_base: 4800 }), new Date(2026, 4, 1), {
      archived: false,
      lastValuedMonth: '2026-05',
    });

    expect(value).toBe(4800);
  });

  it('shows an archived account through the month it was last valued in', () => {
    const may = timelineCellValue(row(), new Date(2026, 4, 1), {
      archived: true,
      lastValuedMonth: '2026-05',
    });

    expect(may).toBe(5000);
  });

  it('keeps an archived account in the months before its last valuation', () => {
    const march = timelineCellValue(row({ valued_on: '2026-03-31' }), new Date(2026, 2, 1), {
      archived: true,
      lastValuedMonth: '2026-05',
    });

    expect(march).toBe(5000);
  });

  it('drops an archived account after its last valuation, even on a non-zero balance', () => {
    // The regression this guards: `get_net_worth_summary` carries the last
    // valuation forward indefinitely, so a closed account left holding 5000
    // would otherwise be added to every later month's total for good.
    const june = timelineCellValue(row(), new Date(2026, 5, 1), {
      archived: true,
      lastValuedMonth: '2026-05',
    });
    const nextYear = timelineCellValue(row(), new Date(2027, 0, 1), {
      archived: true,
      lastValuedMonth: '2026-05',
    });

    expect(june).toBeNull();
    expect(nextYear).toBeNull();
  });

  it('compares by month, not by day, so a mid-month valuation still counts', () => {
    const value = timelineCellValue(row({ valued_on: '2026-05-15' }), new Date(2026, 4, 1), {
      archived: true,
      lastValuedMonth: '2026-05',
    });

    expect(value).toBe(5000);
  });

  it('orders months numerically across a year boundary', () => {
    const january = timelineCellValue(row({ valued_on: '2027-01-31' }), new Date(2027, 0, 1), {
      archived: true,
      lastValuedMonth: '2027-01',
    });
    const december = timelineCellValue(row({ valued_on: '2026-09-30' }), new Date(2026, 11, 1), {
      archived: true,
      lastValuedMonth: '2026-09',
    });

    expect(january).toBe(5000);
    expect(december).toBeNull();
  });
});
