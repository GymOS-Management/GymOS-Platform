import { messageFor } from '@/lib/api/problems';
import { spanInDays, toIsoDate, type DateRange } from '@/lib/analytics/range';

/**
 * The rules around `GET /audit-logs/export` that the console mirrors before asking (F5-DESIGN D8).
 *
 * Mirroring is not trusting: the dialog blocks the common mistakes so they never become a round
 * trip, and the API's own `audit.export_range` refusal still renders like any other error if a
 * request slips past — the same stance F3's `RangeControl` takes.
 */

/** `AuditCsv.MaxRangeDays` — 366, inclusive of both ends, a full year including a leap day. */
export const MAX_EXPORT_RANGE_DAYS = 366;

export type { DateRange };

const MS_PER_DAY = 86_400_000;

/** The last 30 days ending today, in UTC — the same default the analytics screens open on. */
export function defaultExportRange(today: Date): DateRange {
  return {
    from: toIsoDate(new Date(today.getTime() - 29 * MS_PER_DAY)),
    to: toIsoDate(today),
  };
}

/**
 * Why the API would refuse this range, or `null` if it would not.
 *
 * The over-limit and inverted cases return the sentence mapped for `audit.export_range`, so the
 * operator reads the same words whether the dialog or the API is the one refusing.
 */
export function explainInvalidExportRange(range: DateRange): string | null {
  const span = spanInDays(range);

  if (!Number.isFinite(span)) {
    return 'Enter both dates.';
  }

  if (span < 1 || span > MAX_EXPORT_RANGE_DAYS) {
    return messageFor('audit.export_range', undefined, 400);
  }

  return null;
}

/**
 * Whole UTC days, as `date-time` values. `to` ends at 23:59:59 rather than midnight of the next
 * day: the API's check is `to - from > 366 days`, and a 366-day inclusive range sent as two midnights
 * would measure exactly 366 days and pass — but the same range with `to` at midnight would exclude
 * the last day's entries entirely. The last second keeps the day and stays under the limit.
 */
export function exportRangeToQuery(range: DateRange): { from: string; to: string } {
  return { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z` };
}

/**
 * The filename an attachment asks for. ASP.NET's `Results.Stream(..., fileDownloadName)` sends both
 * `filename=` and `filename*=UTF-8''…`; the starred form is preferred because it is the one that
 * survives non-ASCII. Any directory part is stripped — the browser would too, but a suggestion the
 * console makes should already be sane.
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const starred = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header);

  let name: string | null = null;

  if (starred?.[1]) {
    try {
      name = decodeURIComponent(starred[1].trim());
    } catch {
      name = null;
    }
  }

  if (!name && plain) {
    name = (plain[1] ?? plain[2] ?? '').trim();
  }

  if (!name) {
    return null;
  }

  const leaf = name.split(/[\\/]/).pop() ?? '';

  return leaf.length > 0 ? leaf : null;
}
