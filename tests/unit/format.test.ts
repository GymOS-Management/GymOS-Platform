import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/utils/format';

/**
 * D2: Money carries minor units per currency and the backend rounds to them. A `toFixed(2)` would
 * print JPY with two decimals it does not have and truncate KWD's third. These three currencies are
 * the whole reason this helper exists rather than a template string.
 *
 * The literals below are exact matches, not substrings, and reflect en-US formatting specifically
 * because tests/setup.ts pins `Intl.NumberFormat(undefined, …)` to en-US for this process (see the
 * comment there for why — the short version: CI's OS locale is not guaranteed to be en-GB/en-US, and
 * env-var pinning does not work on Windows). `toBe` rather than `toContain` matters here: a
 * `${amount} ${currency}` template-string mutant would coincidentally satisfy `toContain('12.345')`
 * for the KWD case (the raw amount already has three decimals), so only an exact match on the whole
 * string — symbol/code placement included — actually distinguishes the real formatter from that
 * mutant.
 */
describe('formatMoney', () => {
  it('renders a 2-minor-unit currency', () => {
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
  });

  it('renders a 0-minor-unit currency without decimals', () => {
    expect(formatMoney(1234, 'JPY')).toBe('¥1,234');
  });

  it('renders a 3-minor-unit currency with three decimals', () => {
    expect(formatMoney(12.345, 'KWD')).toBe('KWD 12.345');
  });

  it('accepts the string amounts the API can send', () => {
    expect(formatMoney('99.99', 'EUR')).toBe('€99.99');
  });

  it('renders a dash for absent values rather than NaN', () => {
    expect(formatMoney(null, 'EUR')).toBe('—');
    expect(formatMoney(10, null)).toBe('—');
  });

  it('falls back to the code rather than throwing on an unknown currency', () => {
    expect(formatMoney(5, 'ZZZ')).toContain('5');
  });
});
