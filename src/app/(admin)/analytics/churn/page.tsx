'use client';

import { useCallback } from 'react';
import { ColumnChart } from '@/components/charts/column-chart';
import { ChartLegend } from '@/components/charts/chart-parts';
import { AnalyticsScreen } from '@/features/analytics/analytics-screen';
import { SeriesTable } from '@/features/analytics/series-table';
import { analytics } from '@/lib/api/endpoints';
import type { ChurnPoint } from '@/types/api';

const CAUSES = [
  {
    label: 'Canceled',
    color: 'var(--chart-1)',
    valueOf: (row: ChurnPoint) => Number(row.canceled),
  },
  { label: 'Expired', color: 'var(--chart-2)', valueOf: (row: ChurnPoint) => Number(row.expired) },
];

/**
 * Churn, with its two causes kept apart.
 *
 * M3.2 kept `Canceled` (a decision the customer made) and `Expired` (a failure to collect) as
 * distinct terminal states, and M5 refused the frozen spec's single `churned_gyms` column on the
 * grounds that the distinction cannot be recovered from a merged number afterwards
 * (`Analytics.md` §5). The first question anyone asks of a churn chart is *why* — a product problem
 * or a payments problem — so the two are separate segments and `total` lives in the tooltip rather
 * than as a third mark competing with them.
 */
export default function ChurnAnalyticsPage() {
  const dateOf = useCallback((row: ChurnPoint) => row.date, []);

  return (
    <AnalyticsScreen<ChurnPoint>
      title="Churn"
      description="Subscriptions that ended, by cause, recorded once a night."
      fetcher={(range, signal) => analytics.churn(range.from, range.to, signal)}
      dateOf={dateOf}
      footnote={
        // Recorded on the screen rather than left in a document nobody opens: presenting two
        // differently-clocked numbers as symmetric, without saying so, is the honest-looking kind
        // of wrong (Analytics.md §11, F3-DESIGN D5).
        <div className="text-muted-foreground space-y-1 text-xs">
          <p>
            <strong className="font-medium">These two counts keep different clocks.</strong>{' '}
            Cancellations are counted on the moment cancellation ran; expiries are counted on the
            business date the subscription&rsquo;s period targeted. Day-by-day correlation between
            them is approximate rather than exact.
          </p>
          <p>
            An expiry the renewal job records late is left out of this series permanently — a stat
            row is written once and never revisited — so a low expiry count is not by itself proof
            of a low expiry rate.
          </p>
        </div>
      }
    >
      {(series, view) =>
        view === 'table' ? (
          <SeriesTable
            points={series.points}
            columns={[
              {
                key: 'canceled',
                label: 'Canceled',
                render: (row) => Number(row.canceled).toLocaleString(),
              },
              {
                key: 'expired',
                label: 'Expired',
                render: (row) => Number(row.expired).toLocaleString(),
              },
              { key: 'total', label: 'Total', render: (row) => Number(row.total).toLocaleString() },
            ]}
          />
        ) : (
          <>
            <ColumnChart<ChurnPoint>
              title="Subscriptions ended per day, by cause"
              points={series.points}
              series={CAUSES}
              totalOf={(row) => Number(row.total)}
            />
            <ChartLegend entries={CAUSES.map(({ label, color }) => ({ label, color }))} />
          </>
        )
      }
    </AnalyticsScreen>
  );
}
