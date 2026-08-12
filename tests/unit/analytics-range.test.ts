import { describe, expect, it } from 'vitest';
import {
  MAX_RANGE_DAYS,
  RANGE_PRESETS,
  clampRange,
  defaultRange,
  explainInvalidRange,
  isValidRange,
  spanInDays,
  toIsoDate,
} from '@/lib/analytics/range';

/**
 * D8: the control clamps to what the API accepts — `from` and `to` required, inclusive span at most
 * 366 days, either mistake being `analytics.range_invalid`.
 *
 * A fixed "today" is passed in rather than read from the clock, so these assertions do not change
 * meaning overnight or on a leap day.
 */
const TODAY = new Date('2026-08-12T09:00:00Z');

describe('spanInDays — counted the way the backend counts it', () => {
  it('is inclusive of both endpoints', () => {
    expect(spanInDays({ from: '2026-08-01', to: '2026-08-01' })).toBe(1);
    expect(spanInDays({ from: '2026-08-01', to: '2026-08-02' })).toBe(2);
  });

  it('counts a full leap year as 366 — the exact limit, not one over', () => {
    expect(spanInDays({ from: '2028-01-01', to: '2028-12-31' })).toBe(MAX_RANGE_DAYS);
    expect(isValidRange({ from: '2028-01-01', to: '2028-12-31' })).toBe(true);
  });
});

describe('range validation', () => {
  it('accepts 366 days and refuses 367', () => {
    expect(isValidRange({ from: '2026-01-01', to: '2027-01-01' })).toBe(true);
    expect(isValidRange({ from: '2026-01-01', to: '2027-01-02' })).toBe(false);
  });

  it('refuses an end date before the start', () => {
    expect(isValidRange({ from: '2026-08-10', to: '2026-08-09' })).toBe(false);
    expect(explainInvalidRange({ from: '2026-08-10', to: '2026-08-09' })).toMatch(
      /end date cannot be before/i,
    );
  });

  it('explains an over-long range with the span it actually covers', () => {
    const problem = explainInvalidRange({ from: '2026-01-01', to: '2027-06-01' });

    expect(problem).toContain(String(MAX_RANGE_DAYS));
    expect(problem).toContain('517');
  });

  it('says nothing when the range is fine', () => {
    expect(explainInvalidRange({ from: '2026-08-01', to: '2026-08-31' })).toBeNull();
  });
});

describe('clampRange — trims the far end, keeps the recent one', () => {
  it('moves `from` forward and leaves `to` alone', () => {
    const clamped = clampRange({ from: '2020-01-01', to: '2026-08-12' });

    expect(clamped.to).toBe('2026-08-12');
    expect(spanInDays(clamped)).toBe(MAX_RANGE_DAYS);
  });

  it('leaves an already-valid range untouched', () => {
    const range = { from: '2026-08-01', to: '2026-08-31' };

    expect(clampRange(range)).toEqual(range);
  });
});

describe('presets', () => {
  it('every preset produces a range the API would accept', () => {
    for (const preset of RANGE_PRESETS) {
      const range = preset.build(TODAY);

      expect(isValidRange(range), `${preset.id} produced ${range.from}..${range.to}`).toBe(true);
    }
  });

  it('last 7 days is 7 days including today', () => {
    const range = RANGE_PRESETS.find((preset) => preset.id === 'last-7')!.build(TODAY);

    expect(range).toEqual({ from: '2026-08-06', to: '2026-08-12' });
    expect(spanInDays(range)).toBe(7);
  });

  it('month to date starts on the first of the month', () => {
    const range = RANGE_PRESETS.find((preset) => preset.id === 'month-to-date')!.build(TODAY);

    expect(range).toEqual({ from: '2026-08-01', to: '2026-08-12' });
  });

  it('defaults to the last 30 days', () => {
    expect(defaultRange(TODAY)).toEqual({ from: '2026-07-14', to: '2026-08-12' });
  });

  it('formats dates in UTC, matching the backend’s day boundaries', () => {
    // Late-evening UTC: a formatter using local time in a positive-offset zone would roll to the
    // 13th and ask the API for a day that has no row yet.
    expect(toIsoDate(new Date('2026-08-12T23:30:00Z'))).toBe('2026-08-12');
  });
});
