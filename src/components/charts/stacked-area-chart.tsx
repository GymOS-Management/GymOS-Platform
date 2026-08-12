'use client';

import { useMemo } from 'react';
import {
  ChartFrame,
  dayScale,
  linearScale,
  shortDate,
  useDateTicks,
  useNearestDay,
} from './chart-frame';
import { ChartTooltip } from './chart-parts';
import { toContiguousRuns, type SeriesPoint } from '@/lib/analytics/series';

export interface AreaSeries<T> {
  label: string;
  color: string;
  valueOf: (value: T) => number;
}

export interface StackedAreaChartProps<T> {
  title: string;
  points: SeriesPoint<T>[];
  /** Stacked bottom-up in array order. Three is the cap — see the palette note in `globals.css`. */
  series: AreaSeries<T>[];
  formatValue?: (value: number) => string;
  /** Labels the stack height in the tooltip, e.g. "Total gyms". */
  totalLabel?: string;
}

/**
 * Population over time as a stack, where the stack height is the whole.
 *
 * Used for gym population, where `active + suspended + provisioning` genuinely sums to `totalGyms` —
 * `provisioningGyms` exists in the API response precisely so the parts reconcile (`Analytics.md`
 * §3). A stack is only honest when that is true; it is not used for event counts, which do not sum
 * to anything and live on their own chart (F3-DESIGN D4).
 *
 * **Each contiguous run of days is its own set of shapes**, so a night with no row leaves a real hole
 * rather than a band drawn straight across it (D3).
 */
export function StackedAreaChart<T>({
  title,
  points,
  series,
  formatValue = (value) => value.toLocaleString(),
  totalLabel,
}: StackedAreaChartProps<T>) {
  const scale = useMemo(() => dayScale(points.map((point) => point.dayNumber)), [points]);

  const yScale = useMemo(
    () =>
      linearScale(
        points.map((point) => series.reduce((sum, entry) => sum + entry.valueOf(point.value), 0)),
      ),
    [points, series],
  );

  const runs = useMemo(() => toContiguousRuns(points), [points]);
  const xTicks = useDateTicks(points, scale.x);
  const { activeDay, onPointerMoveValue, onPointerLeave } = useNearestDay(points, scale.x);
  const active = points.find((point) => point.dayNumber === activeDay);

  return (
    <ChartFrame
      title={title}
      yScale={yScale}
      formatY={formatValue}
      xTicks={xTicks}
      onPointerMoveValue={onPointerMoveValue}
      onPointerLeave={onPointerLeave}
      hover={
        active ? (
          <ChartTooltip
            leftPercent={(scale.x(active.dayNumber) / 960) * 100}
            title={shortDate(active.date)}
            rows={[
              ...series.map((entry) => ({
                label: entry.label,
                value: formatValue(entry.valueOf(active.value)),
                color: entry.color,
              })),
              ...(totalLabel
                ? [
                    {
                      label: totalLabel,
                      value: formatValue(
                        series.reduce((sum, entry) => sum + entry.valueOf(active.value), 0),
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : null
      }
    >
      {runs.map((run) =>
        series.map((entry, entryIndex) => {
          const head = run[0];

          if (!head) {
            return null;
          }

          // Each band runs from the sum of the bands below it to that sum plus its own value.
          const lower = (point: SeriesPoint<T>) =>
            series.slice(0, entryIndex).reduce((sum, below) => sum + below.valueOf(point.value), 0);

          const top = run
            .map((point, index) => {
              const command = index === 0 ? 'M' : 'L';
              return `${command}${scale.x(point.dayNumber)} ${yScale.y(lower(point) + entry.valueOf(point.value))}`;
            })
            .join(' ');

          const bottom = [...run]
            .reverse()
            .map((point) => `L${scale.x(point.dayNumber)} ${yScale.y(lower(point))}`)
            .join(' ');

          return (
            <path
              key={`${head.date}-${entry.label}`}
              d={`${top} ${bottom} Z`}
              fill={entry.color}
              // A single flat opacity across bands, with a surface-coloured hairline between them,
              // keeps each band's colour close to its legend swatch — tinting them would make the
              // legend a poor key for the chart.
              stroke="var(--card)"
              strokeWidth={1}
            />
          );
        }),
      )}

      {active ? (
        <line
          x1={scale.x(active.dayNumber)}
          x2={scale.x(active.dayNumber)}
          y1={16}
          y2={yScale.y(yScale.min)}
          stroke="var(--chart-axis)"
          strokeWidth={1}
        />
      ) : null}
    </ChartFrame>
  );
}
