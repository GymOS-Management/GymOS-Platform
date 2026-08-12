/**
 * The date range every `/analytics/*` call carries.
 *
 * `from` and `to` are both required and the inclusive span may not exceed **366 days**; either
 * mistake is `analytics.range_invalid` (400). The control clamps to what the API accepts — but
 * clamping is not the same as trusting: a URL can be hand-edited, so the screens still render the
 * backend's refusal like any other typed error (F3-DESIGN D8).
 */

/** The backend's own limit, from `AnalyticsRangeRules`. Inclusive of both endpoints. */
export const MAX_RANGE_DAYS = 366;

export interface DateRange {
  /** ISO `YYYY-MM-DD`. */
  from: string;
  /** ISO `YYYY-MM-DD`, on or after `from`. */
  to: string;
}

export interface RangePreset {
  id: string;
  label: string;
  /** Builds the range from "today" — passed in rather than read, so this stays pure and testable. */
  build: (today: Date) => DateRange;
}

const MS_PER_DAY = 86_400_000;

/**
 * ISO date in **UTC**, matching the backend's day boundaries (`Analytics.md` §2: "a platform-wide
 * figure has to be summed over one clock"). Formatting in the browser's zone would ask for the wrong
 * day for anyone west of Greenwich for part of their afternoon.
 */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Inclusive span, counted the way the backend counts it: `to - from + 1`. */
export function spanInDays(range: DateRange): number {
  return (
    Math.round(
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / MS_PER_DAY,
    ) + 1
  );
}

export function isValidRange(range: DateRange): boolean {
  const span = spanInDays(range);

  return Number.isFinite(span) && span >= 1 && span <= MAX_RANGE_DAYS;
}

/**
 * Why the API would refuse this range, or `null` if it would not — so the control can explain itself
 * before a request is made rather than after one comes back 400.
 */
export function explainInvalidRange(range: DateRange): string | null {
  const span = spanInDays(range);

  if (!Number.isFinite(span)) {
    return 'Enter both dates.';
  }

  if (span < 1) {
    return 'The end date cannot be before the start date.';
  }

  if (span > MAX_RANGE_DAYS) {
    return `A range covers at most ${MAX_RANGE_DAYS} days; this one covers ${span}.`;
  }

  return null;
}

/**
 * Trims a range to the maximum span by moving `from` forward, keeping `to` where it is — the recent
 * end is the one an operator is looking at.
 */
export function clampRange(range: DateRange): DateRange {
  if (spanInDays(range) <= MAX_RANGE_DAYS) {
    return range;
  }

  const to = new Date(`${range.to}T00:00:00Z`);

  return { from: toIsoDate(shiftDays(to, -(MAX_RANGE_DAYS - 1))), to: range.to };
}

/**
 * `to` is **today** rather than yesterday even though the most recent row is always yesterday's (the
 * stats job compiles a day only once it is over). Asking for today costs nothing, and a range that
 * silently stopped a day short would look like a gap in the data — which is the one thing F3 is
 * careful never to fake in either direction.
 */
export const RANGE_PRESETS: RangePreset[] = [
  {
    id: 'last-7',
    label: 'Last 7 days',
    build: (today) => ({ from: toIsoDate(shiftDays(today, -6)), to: toIsoDate(today) }),
  },
  {
    id: 'last-30',
    label: 'Last 30 days',
    build: (today) => ({ from: toIsoDate(shiftDays(today, -29)), to: toIsoDate(today) }),
  },
  {
    id: 'last-90',
    label: 'Last 90 days',
    build: (today) => ({ from: toIsoDate(shiftDays(today, -89)), to: toIsoDate(today) }),
  },
  {
    id: 'month-to-date',
    label: 'Month to date',
    build: (today) => ({
      from: toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
      to: toIsoDate(today),
    }),
  },
  {
    id: 'year-to-date',
    label: 'Year to date',
    // Clamped: 1 January to 31 December is 365 or 366 days, and a leap year lands exactly on the
    // limit — so this is the one preset that can reach it.
    build: (today) =>
      clampRange({
        from: toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), 0, 1))),
        to: toIsoDate(today),
      }),
  },
];

export const DEFAULT_PRESET_ID = 'last-30';

export function defaultRange(today: Date): DateRange {
  const preset = RANGE_PRESETS.find((candidate) => candidate.id === DEFAULT_PRESET_ID);

  // The default id is a constant naming one of the presets above, so this is always found. The
  // fallback is a literal rather than `RANGE_PRESETS[0]` so this function has no failure mode even
  // if the list is ever emptied.
  return preset
    ? preset.build(today)
    : { from: toIsoDate(shiftDays(today, -29)), to: toIsoDate(today) };
}
