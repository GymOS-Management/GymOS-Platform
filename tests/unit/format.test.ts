import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/utils/format';

/**
 * D2: Money carries minor units per currency and the backend rounds to them. A `toFixed(2)` would
 * print JPY with two decimals it does not have and truncate KWD's third. These three currencies are
 * the whole reason this helper exists rather than a template string.
 */
describe('formatMoney', () => {
  it('renders a 2-minor-unit currency', () => {
    expect(formatMoney(1234.5, 'EUR')).toContain('1,234.50');
  });

  it('renders a 0-minor-unit currency without decimals', () => {
    const text = formatMoney(1234, 'JPY');
    expect(text).toContain('1,234');
    expect(text).not.toContain('1,234.00');
  });

  it('renders a 3-minor-unit currency with three decimals', () => {
    expect(formatMoney(12.345, 'KWD')).toContain('12.345');
  });

  it('accepts the string amounts the API can send', () => {
    expect(formatMoney('99.99', 'EUR')).toContain('99.99');
  });

  it('renders a dash for absent values rather than NaN', () => {
    expect(formatMoney(null, 'EUR')).toBe('—');
    expect(formatMoney(10, null)).toBe('—');
  });

  it('falls back to the code rather than throwing on an unknown currency', () => {
    expect(formatMoney(5, 'ZZZ')).toContain('5');
  });
});
