'use client';

import { useCallback } from 'react';
import { ColumnChart } from '@/components/charts/column-chart';
import { StackedAreaChart } from '@/components/charts/stacked-area-chart';
import { ChartLegend } from '@/components/charts/chart-parts';
import { AnalyticsScreen } from '@/features/analytics/analytics-screen';
import { SeriesTable } from '@/features/analytics/series-table';
import { analytics } from '@/lib/api/endpoints';
import type { GrowthPoint } from '@/types/api';

const POPULATION = [
  {
    label: 'Active',
    color: 'var(--chart-1)',
    valueOf: (row: GrowthPoint) => Number(row.activeGyms),
  },
  {
    label: 'Suspended',
    color: 'var(--chart-2)',
    valueOf: (row: GrowthPoint) => Number(row.suspendedGyms),
  },
  {
    label: 'Provisioning',
    color: 'var(--chart-3)',
    valueOf: (row: GrowthPoint) => Number(row.provisioningGyms),
  },
];

const NEW_GYMS = [
  {
    label: 'New gyms',
    color: 'var(--chart-2)',
    valueOf: (row: GrowthPoint) => Number(row.newGyms),
  },
];

/**
 * Gym population and acquisition — **two charts, deliberately, on one screen**.
 *
 * `Analytics.md` §3 keeps two families of count apart, and they do **not** reconcile: population
 * counts exclude deleted gyms, event counts include them, because a gym created and deleted the same
 * day is still one created. That asymmetry was an owner ruling mid-increment and is pinned by
 * `ADeletedGymLeavesThePopulationButStillCountsAsChurn`.
 *
 * Drawing `newGyms` as a fourth series beside the population would invite a reader to check that the
 * population moved by the number of new gyms. It will not, and nothing on a shared axis could
 * explain why — so the families get separate charts and separate axes (F3-DESIGN D4).
 *
 * It is also why three series is enough everywhere in F3: the palette's fourth slot would put yellow
 * beside orange and fail the colour-vision gates, and the honest split avoids ever needing it.
 */
export default function GrowthAnalyticsPage() {
  const dateOf = useCallback((row: GrowthPoint) => row.date, []);

  return (
    <AnalyticsScreen<GrowthPoint>
      title="Growth"
      description="Tenant population and new gyms, recorded once a night."
      fetcher={(range, signal) => analytics.gymsGrowth(range.from, range.to, signal)}
      dateOf={dateOf}
    >
      {(series, view) =>
        view === 'table' ? (
          <SeriesTable
            points={series.points}
            columns={[
              {
                key: 'total',
                label: 'Total',
                render: (row) => Number(row.totalGyms).toLocaleString(),
              },
              {
                key: 'active',
                label: 'Active',
                render: (row) => Number(row.activeGyms).toLocaleString(),
              },
              {
                key: 'suspended',
                label: 'Suspended',
                render: (row) => Number(row.suspendedGyms).toLocaleString(),
              },
              {
                key: 'provisioning',
                label: 'Provisioning',
                render: (row) => Number(row.provisioningGyms).toLocaleString(),
              },
              { key: 'new', label: 'New', render: (row) => Number(row.newGyms).toLocaleString() },
            ]}
          />
        ) : (
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-medium">Population</h3>
              <p className="text-muted-foreground mb-2 text-xs">
                Who is a tenant on each day. The stack height is the total; deleted gyms are
                excluded.
              </p>
              <StackedAreaChart<GrowthPoint>
                title="Gym population by status"
                points={series.points}
                series={POPULATION}
                totalLabel="Total gyms"
              />
              <ChartLegend entries={POPULATION.map(({ label, color }) => ({ label, color }))} />
            </section>

            <section>
              <h3 className="text-sm font-medium">New gyms</h3>
              <p className="text-muted-foreground mb-2 text-xs">
                What happened on each day. Counted even if the gym was deleted later the same day —
                which is why this does not reconcile against the population above.
              </p>
              <ColumnChart<GrowthPoint>
                title="New gyms per day"
                points={series.points}
                series={NEW_GYMS}
              />
            </section>
          </div>
        )
      }
    </AnalyticsScreen>
  );
}
