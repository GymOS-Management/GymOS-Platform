import { describe, expect, it } from 'vitest';
import {
  MAX_EXPORT_RANGE_DAYS,
  defaultExportRange,
  explainInvalidExportRange,
  exportRangeToQuery,
  parseContentDispositionFilename,
} from '@/lib/settings/export';

const today = new Date('2026-09-20T10:00:00Z');

describe('the export range (D8)', () => {
  it('defaults to the last 30 days ending today', () => {
    expect(defaultExportRange(today)).toEqual({ from: '2026-08-22', to: '2026-09-20' });
  });

  it('accepts a range of exactly the maximum', () => {
    expect(explainInvalidExportRange({ from: '2025-09-20', to: '2026-09-20' })).toBeNull();
    expect(MAX_EXPORT_RANGE_DAYS).toBe(366);
  });

  it('refuses an inverted range with the sentence the API uses', () => {
    expect(explainInvalidExportRange({ from: '2026-09-21', to: '2026-09-20' })).toMatch(
      /start.*on or before.*end/i,
    );
  });

  it('refuses a range past the maximum, naming the limit', () => {
    expect(explainInvalidExportRange({ from: '2025-09-19', to: '2026-09-20' })).toMatch(/366/);
  });

  it('asks for both dates when one is missing', () => {
    expect(explainInvalidExportRange({ from: '', to: '2026-09-20' })).toMatch(/both dates/i);
  });

  it('sends whole UTC days: midnight at the start, the last second at the end', () => {
    // `to` is inclusive server-side and the span check is `to - from > 366 days`, so a `to` of
    // 23:59:59 on the last day keeps a 366-day inclusive range strictly under the limit.
    expect(exportRangeToQuery({ from: '2026-08-22', to: '2026-09-20' })).toEqual({
      from: '2026-08-22T00:00:00Z',
      to: '2026-09-20T23:59:59Z',
    });
  });
});

describe('parseContentDispositionFilename', () => {
  it('prefers the RFC 5987 filename* form, decoded', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=fallback.csv; filename*=UTF-8''audit%20logs.csv",
      ),
    ).toBe('audit logs.csv');
  });

  it('falls back to a quoted or bare filename', () => {
    expect(parseContentDispositionFilename('attachment; filename="a.csv"')).toBe('a.csv');
    expect(parseContentDispositionFilename('attachment; filename=a.csv')).toBe('a.csv');
  });

  it('returns null when there is no header or no filename in it', () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('inline')).toBeNull();
  });

  it('strips any path a hostile header might carry', () => {
    // The browser treats the name as a suggestion, but a "../" in it should not even be suggested.
    expect(parseContentDispositionFilename('attachment; filename="../../etc/passwd"')).toBe(
      'passwd',
    );
  });
});
