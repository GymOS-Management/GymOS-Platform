import { describe, expect, it } from 'vitest';
import {
  amountFor,
  buildSeries,
  currenciesIn,
  describeGaps,
  toContiguousRuns,
  toDayNumber,
} from '@/lib/analytics/series';

/**
 * **F3's highest-value tests.** D3 is the rule most likely to be "helpfully" undone by a later
 * contributor who builds a continuous date axis and defaults the missing days to zero — which is
 * exactly the lie the backend refused to tell, at the cost of its own test
 * (`AGapInTheSeriesIsReturnedAsAGapAndNeverAsZeros`) and a paragraph in `Analytics.md` §2.
 *
 * A missing day returned as zero draws a chart to the floor and reads as "every gym vanished that
 * night."
 */

interface Row {
  date: string;
  value: number;
}

const dateOf = (row: Row) => row.date;

describe('buildSeries — a gap is recorded, never filled', () => {
  it('reports a one-day hole as a gap and keeps only the days that exist', () => {
    // 2026-08-01 and 2026-08-03 have rows; the 2nd does not.
    const series = buildSeries<Row>(
      [
        { date: '2026-08-01', value: 10 },
        { date: '2026-08-03', value: 12 },
      ],
      dateOf,
    );

    expect(series.points).toHaveLength(2);
    expect(series.missingDays).toBe(1);
    expect(series.gaps).toEqual([{ after: '2026-08-01', before: '2026-08-03', missingDays: 1 }]);

    // The point that matters: nothing invented a row for the 2nd.
    expect(series.points.map((point) => point.date)).toEqual(['2026-08-01', '2026-08-03']);
    expect(series.points.some((point) => point.value.value === 0)).toBe(false);
  });

  it('has no gaps when every day in the range is present', () => {
    const series = buildSeries<Row>(
      [
        { date: '2026-08-01', value: 1 },
        { date: '2026-08-02', value: 2 },
        { date: '2026-08-03', value: 3 },
      ],
      dateOf,
    );

    expect(series.missingDays).toBe(0);
    expect(series.gaps).toEqual([]);
    expect(describeGaps(series)).toBeNull();
  });

  it('counts several breaks and every missing day across them', () => {
    const series = buildSeries<Row>(
      [
        { date: '2026-08-01', value: 1 },
        { date: '2026-08-05', value: 2 }, // 3 missing
        { date: '2026-08-06', value: 3 },
        { date: '2026-08-09', value: 4 }, // 2 missing
      ],
      dateOf,
    );

    expect(series.gaps).toHaveLength(2);
    expect(series.missingDays).toBe(5);

    const note = describeGaps(series);
    expect(note).toContain('5 days');
    expect(note).toContain('2 breaks');
    // The note must say what the empty space means, or a broken line reads as a rendering fault.
    expect(note).toMatch(/rather than drawn as zero/i);
  });

  it('orders points by date even if the response is not sorted', () => {
    const series = buildSeries<Row>(
      [
        { date: '2026-08-03', value: 3 },
        { date: '2026-08-01', value: 1 },
      ],
      dateOf,
    );

    expect(series.points.map((point) => point.date)).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('handles an empty response without inventing anything', () => {
    const series = buildSeries<Row>([], dateOf);

    expect(series.points).toEqual([]);
    expect(series.missingDays).toBe(0);
    expect(describeGaps(series)).toBeNull();
  });

  it('reads dates as UTC, so the day does not shift with the runner’s time zone', () => {
    // One day apart in UTC. Parsed in a negative-offset local zone, a naive `new Date('2026-08-01')`
    // reading would move both back a day and could collapse the difference.
    expect(toDayNumber('2026-08-02') - toDayNumber('2026-08-01')).toBe(1);
  });
});

describe('toContiguousRuns — the line breaks rather than spanning', () => {
  it('splits at a gap so each run is drawn as its own path', () => {
    const series = buildSeries<Row>(
      [
        { date: '2026-08-01', value: 1 },
        { date: '2026-08-02', value: 2 },
        { date: '2026-08-05', value: 5 },
        { date: '2026-08-06', value: 6 },
      ],
      dateOf,
    );

    const runs = toContiguousRuns(series.points);

    expect(runs).toHaveLength(2);
    expect(runs[0]?.map((point) => point.date)).toEqual(['2026-08-01', '2026-08-02']);
    expect(runs[1]?.map((point) => point.date)).toEqual(['2026-08-05', '2026-08-06']);
  });

  it('keeps a lone day as its own run so it still gets drawn', () => {
    const series = buildSeries<Row>(
      [
        { date: '2026-08-01', value: 1 },
        { date: '2026-08-10', value: 9 },
      ],
      dateOf,
    );

    expect(toContiguousRuns(series.points).map((run) => run.length)).toEqual([1, 1]);
  });
});

describe('currency helpers — a missing currency is not zero', () => {
  const rows = [
    { date: '2026-08-01', mrr: [{ amount: 120.5, currency: 'EUR' }] },
    {
      date: '2026-08-02',
      mrr: [
        { amount: 130, currency: 'EUR' },
        { amount: 4000, currency: 'JPY' },
      ],
    },
  ];

  it('collects every currency present, sorted by code', () => {
    expect(currenciesIn(rows)).toEqual(['EUR', 'JPY']);
  });

  it('returns null — not 0 — for a day that carries no entry for a currency', () => {
    // 1 August billed nothing in JPY. Reporting that as ¥0 would draw the line to the axis and
    // assert a figure nobody recorded; null breaks the line instead, exactly like a missing day.
    expect(amountFor(rows[0]!, 'JPY')).toBeNull();
    expect(amountFor(rows[0]!, 'EUR')).toBe(120.5);
    expect(amountFor(rows[1]!, 'JPY')).toBe(4000);
  });

  it('coerces the generator’s `number | string` amounts', () => {
    // openapi-typescript types int/decimal formats as `number | string`; the boundary coerces.
    expect(amountFor({ mrr: [{ amount: '99.95', currency: 'EUR' }] }, 'EUR')).toBe(99.95);
  });
});
