'use client';

import { useCallback } from 'react';
import { LineChart } from '@/components/charts/line-chart';
import { ChartEmpty } from '@/components/charts/chart-parts';
import { AnalyticsScreen } from '@/features/analytics/analytics-screen';
import { SeriesTable } from '@/features/analytics/series-table';
import { analytics } from '@/lib/api/endpoints';
import { amountFor, currenciesIn } from '@/lib/analytics/series';
import { formatMoney } from '@/lib/utils/format';
import type { RevenuePoint } from '@/types/api';

/**
 * Monthly recurring revenue over time — **one chart per currency**.
 *
 * `Analytics.md` §4: MRR is computed per currency and never summed, because adding unlike currencies
 * needs an exchange-rate policy (AD-43) nobody has decided. Putting two currencies on one y-axis
 * would be that forbidden sum wearing a disguise: €120 and ¥120 drawn at the same height mean
 * nothing alike. So the currencies become small multiples, each with its own axis and its own
 * `formatMoney` precision — JPY has no minor units, KWD has three (F3-DESIGN D2).
 */
export default function RevenueAnalyticsPage() {
  const dateOf = useCallback((row: RevenuePoint) => row.date, []);

  return (
    <AnalyticsScreen<RevenuePoint>
      title="Revenue"
      description="Monthly recurring revenue, recorded once a night."
      fetcher={(range, signal) => analytics.revenue(range.from, range.to, signal)}
      dateOf={dateOf}
    >
      {(series, view) => {
        const currencies = currenciesIn(series.points.map((point) => point.value));

        if (currencies.length === 0) {
          return (
            <ChartEmpty>
              These days were recorded, but no subscription was billing in any currency.
            </ChartEmpty>
          );
        }

        if (view === 'table') {
          return (
            <SeriesTable<RevenuePoint>
              points={series.points}
              columns={currencies.map((currency) => ({
                key: currency,
                label: currency,
                render: (row) => formatMoney(amountFor(row, currency), currency),
              }))}
            />
          );
        }

        return (
          <div className="space-y-8">
            {currencies.map((currency) => (
              <div key={currency}>
                <h3 className="mb-1 text-sm font-medium">{currency}</h3>
                <LineChart<RevenuePoint>
                  title={`Monthly recurring revenue in ${currency}`}
                  points={series.points}
                  seriesLabel={`MRR (${currency})`}
                  valueOf={(row) => amountFor(row, currency)}
                  formatValue={(value) => formatMoney(value, currency)}
                />
              </div>
            ))}
          </div>
        );
      }}
    </AnalyticsScreen>
  );
}
