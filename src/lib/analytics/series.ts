/**
 * Turning an analytics response into something a chart can draw — **without inventing days**.
 *
 * The backend returns only the days that have a `daily_platform_stats` row. A night the stats job did
 * not run is simply absent (`Analytics.md` §2), and that is deliberate:
 *
 * > A missing day returned as zeros draws a chart to the floor and reads as "every gym vanished that
 * > night."
 *
 * The backend went to the trouble of not zero-filling and pinned it with a test. The easiest possible
 * mistake on this side is to build a continuous date axis from the requested range and default the
 * missing days to `0` — which throws that away and tells exactly the lie the API refused to tell.
 *
 * So: **nothing here generates a date.** Points come from the response; a gap between two consecutive
 * points is reported as a gap, and the chart breaks its line across it (F3-DESIGN D3).
 */

/** One point on a time series: a day that genuinely has a row, and the numbers it carries. */
export interface SeriesPoint<T> {
  /** The ISO date (`YYYY-MM-DD`) exactly as the API returned it. */
  date: string;
  /** Days since the epoch — the x-coordinate, so a gap is visible as a jump rather than a step. */
  dayNumber: number;
  value: T;
}

export interface SeriesGap {
  /** The last day that has data before the gap. */
  after: string;
  /** The first day that has data after it. */
  before: string;
  /** How many days are missing between them. Always >= 1. */
  missingDays: number;
}

export interface Series<T> {
  points: SeriesPoint<T>[];
  gaps: SeriesGap[];
  /** Total days with no row, across every gap. Zero when the series is continuous or has < 2 points. */
  missingDays: number;
}

const MS_PER_DAY = 86_400_000;

/**
 * Days since 1970-01-01 for an ISO `YYYY-MM-DD` date.
 *
 * Parsed as UTC deliberately: the backend's day boundaries are UTC (`Analytics.md` §2), and reading
 * them in the browser's zone would shift every point by a day for anyone west of Greenwich.
 */
export function toDayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / MS_PER_DAY);
}

/**
 * Builds a series from the API's points, in the order they were returned, recording where the days
 * are missing rather than filling them in.
 *
 * @param rows the response array, one entry per day that has a row
 * @param dateOf reads the ISO date off a row
 */
export function buildSeries<T>(rows: readonly T[], dateOf: (row: T) => string): Series<T> {
  const points: SeriesPoint<T>[] = rows.map((row) => {
    const date = dateOf(row);
    return { date, dayNumber: toDayNumber(date), value: row };
  });

  // Defensive: the API orders by date, but a chart that assumes ordering and does not get it draws a
  // scribble, and sorting here is cheaper than discovering that from a screenshot.
  points.sort((left, right) => left.dayNumber - right.dayNumber);

  const gaps: SeriesGap[] = [];
  let previous: SeriesPoint<T> | undefined;

  for (const current of points) {
    if (previous) {
      const missing = current.dayNumber - previous.dayNumber - 1;

      if (missing > 0) {
        gaps.push({ after: previous.date, before: current.date, missingDays: missing });
      }
    }

    previous = current;
  }

  return {
    points,
    gaps,
    missingDays: gaps.reduce((total, gap) => total + gap.missingDays, 0),
  };
}

/**
 * Splits points into runs of consecutive days, so a line renders as one path per run and **breaks**
 * across a gap instead of drawing a straight segment over days nobody recorded.
 *
 * A single-point run is kept: it still has a marker to draw, and dropping it would hide a day that
 * genuinely has data.
 */
export function toContiguousRuns<T>(points: readonly SeriesPoint<T>[]): SeriesPoint<T>[][] {
  const runs: SeriesPoint<T>[][] = [];
  let run: SeriesPoint<T>[] = [];

  for (const point of points) {
    const previous = run.at(-1);

    if (previous && point.dayNumber !== previous.dayNumber + 1) {
      runs.push(run);
      run = [];
    }

    run.push(point);
  }

  if (run.length > 0) {
    runs.push(run);
  }

  return runs;
}

/**
 * The human sentence for a gap note, or `null` when the series is continuous.
 *
 * Phrased as a statement about the platform ("no data was recorded"), not about the chart, because
 * that is what it means: the stats job did not run those nights, and the days are gone for good — a
 * stat row is written once and never backfilled (`Analytics.md` §2).
 */
export function describeGaps(series: Series<unknown>): string | null {
  if (series.missingDays === 0) {
    return null;
  }

  const days = series.missingDays === 1 ? '1 day' : `${series.missingDays} days`;
  const runs = series.gaps.length === 1 ? 'one break' : `${series.gaps.length} breaks`;

  return `No data was recorded for ${days} in this range (${runs} in the line). Missing days are left empty rather than drawn as zero.`;
}

/** Every distinct currency in a revenue response, in the order the API returned them (by code). */
export function currenciesIn(rows: readonly { mrr: readonly { currency: string }[] }[]): string[] {
  const seen: string[] = [];

  for (const row of rows) {
    for (const money of row.mrr) {
      if (!seen.includes(money.currency)) {
        seen.push(money.currency);
      }
    }
  }

  return seen.sort();
}

/**
 * The amount for one currency on one day, or `null` when that day's row carries no entry for it.
 *
 * `null`, never `0`: a day whose MRR array omits a currency is a day nothing was billed in it, and
 * that is a different fact from "zero revenue" — the same distinction the gap rule makes about whole
 * days. The chart breaks its line rather than dropping to the axis.
 */
export function amountFor(
  row: { mrr: readonly { amount: number | string; currency: string }[] },
  currency: string,
): number | null {
  const money = row.mrr.find((entry) => entry.currency === currency);

  return money === undefined ? null : Number(money.amount);
}
