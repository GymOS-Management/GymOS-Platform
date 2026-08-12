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
import type { SeriesPoint } from '@/lib/analytics/series';

export interface ColumnSeries<T> {
  label: string;
  color: string;
  valueOf: (value: T) => number;
}

export interface ColumnChartProps<T> {
  title: string;
  points: SeriesPoint<T>[];
  /** One entry draws plain columns; two or three stack, bottom-up in array order. */
  series: ColumnSeries<T>[];
  formatValue?: (value: number) => string;
  /** Appended to the tooltip as a computed total. Used by churn, where `total` is a real API field. */
  totalOf?: (value: T) => number;
}

/**
 * Daily counts as columns — plain for one series, stacked for two or three.
 *
 * A day with no row simply has no column, which is the whole gap treatment this form needs: there is
 * nothing to break, because a column is drawn per day that exists. Zero-filling would put a
 * zero-height column under a date that was never recorded, which reads as "nothing happened" rather
 * than "nobody counted" (F3-DESIGN D3).
 *
 * Stacked segments carry a 2px surface gap between them so adjacent fills stay separable — the same
 * reason the palette's slots are ordered rather than picked.
 */
export function ColumnChart<T>({
  title,
  points,
  series,
  formatValue = (value) => value.toLocaleString(),
  totalOf,
}: ColumnChartProps<T>) {
  const scale = useMemo(() => dayScale(points.map((point) => point.dayNumber)), [points]);

  const yScale = useMemo(
    () =>
      linearScale(
        points.map((point) => series.reduce((sum, entry) => sum + entry.valueOf(point.value), 0)),
      ),
    [points, series],
  );

  const xTicks = useDateTicks(points, scale.x);
  const { activeDay, onPointerMoveValue, onPointerLeave } = useNearestDay(points, scale.x);
  const active = points.find((point) => point.dayNumber === activeDay);

  // Columns are capped so a short range does not render slabs, and floored so a year of days is
  // still visible rather than sub-pixel.
  const columnWidth = Math.min(Math.max(scale.bandWidth * 0.7, 2), 28);

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
              ...(totalOf ? [{ label: 'Total', value: formatValue(totalOf(active.value)) }] : []),
            ]}
          />
        ) : null
      }
    >
      {points.map((point) => {
        let cursor = 0;

        return (
          <g
            key={point.date}
            opacity={activeDay === null || activeDay === point.dayNumber ? 1 : 0.55}
          >
            {series.map((entry) => {
              const value = entry.valueOf(point.value);

              if (value <= 0) {
                return null;
              }

              const top = yScale.y(cursor + value);
              const bottom = yScale.y(cursor);
              cursor += value;

              // The 2px surface gap between stacked segments; never taller than the segment itself,
              // or a one-unit segment would vanish into its own spacer.
              const gap = series.length > 1 ? Math.min(2, Math.max(bottom - top - 1, 0)) : 0;
              const height = Math.max(bottom - top - gap, 1);

              return (
                <rect
                  key={entry.label}
                  x={scale.x(point.dayNumber) - columnWidth / 2}
                  y={top}
                  width={columnWidth}
                  height={height}
                  rx={2}
                  fill={entry.color}
                />
              );
            })}
          </g>
        );
      })}
    </ChartFrame>
  );
}
