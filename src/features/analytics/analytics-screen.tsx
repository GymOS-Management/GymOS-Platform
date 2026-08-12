'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartEmpty, GapNote, Provenance } from '@/components/charts/chart-parts';
import { RangeControl } from './range-control';
import { buildSeries, describeGaps, type Series } from '@/lib/analytics/series';
import { defaultRange, isValidRange, type DateRange } from '@/lib/analytics/range';
import { ApiError } from '@/lib/api/problems';

/**
 * The shell all three analytics screens share: the range control, the request, the chart/table
 * toggle, the gap note, and the provenance line.
 *
 * Written once because the four rules it enforces are the same on every screen, and three copies of
 * them is three chances for one to be quietly dropped.
 */
export function AnalyticsScreen<T>({
  title,
  description,
  fetcher,
  dateOf,
  children,
  footnote,
}: {
  title: string;
  description?: ReactNode;
  fetcher: (range: DateRange, signal?: AbortSignal) => Promise<T[]>;
  dateOf: (row: T) => string;
  /** Renders the chart(s) and the table for a built series. */
  children: (series: Series<T>, view: 'chart' | 'table') => ReactNode;
  footnote?: ReactNode;
}) {
  // `today` is fixed for the lifetime of the screen so the preset buttons do not silently change
  // their meaning at midnight while somebody is looking at them.
  const [today] = useState(() => new Date());
  const [range, setRange] = useState<DateRange>(() => defaultRange(today));
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const valid = isValidRange(range);

  const query = useQuery({
    queryKey: ['analytics', title, range.from, range.to],
    queryFn: ({ signal }) => fetcher(range, signal),
    enabled: valid,
    // The underlying row is written once a night and never recomputed, so refetching on focus can
    // only ever return the same bytes (D11).
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });

  const series = useMemo(() => buildSeries(query.data ?? [], dateOf), [query.data, dateOf]);

  const lastPoint = series.points.at(-1);

  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <div className="flex items-center gap-1" role="group" aria-label="View as">
            <Button
              type="button"
              size="sm"
              variant={view === 'chart' ? 'primary' : 'outline'}
              aria-pressed={view === 'chart'}
              onClick={() => setView('chart')}
            >
              Chart
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'table' ? 'primary' : 'outline'}
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              Table
            </Button>
          </div>
        }
      />

      <RangeControl range={range} onChange={setRange} today={today} />

      <Card>
        <CardContent className="p-4 sm:p-6">
          {!valid ? (
            <ChartEmpty>Choose a valid date range to see this series.</ChartEmpty>
          ) : query.isPending ? (
            <Skeleton className="h-72" />
          ) : query.isError ? (
            <ChartEmpty>
              {/* The API's own refusal, shown as it was given — a hand-edited URL is the way an
                  over-long range gets here despite the control clamping (D8). */}
              {query.error instanceof ApiError
                ? (query.error.detail ?? query.error.message)
                : 'This series could not be loaded.'}
            </ChartEmpty>
          ) : series.points.length === 0 ? (
            <ChartEmpty>
              Nothing was recorded in this range. The nightly job writes one row per day, and days
              before it first ran have none.
            </ChartEmpty>
          ) : (
            <>
              {children(series, view)}
              <GapNote note={describeGaps(series)} />
              <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
                <Provenance>
                  Recorded nightly
                  {lastPoint ? ` · last point ${lastPoint.date}` : null} · not live
                </Provenance>
                <Provenance>
                  {series.points.length} {series.points.length === 1 ? 'day' : 'days'} with data
                </Provenance>
              </div>
              {footnote ? <div className="border-border mt-3 border-t pt-3">{footnote}</div> : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
