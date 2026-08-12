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

export interface LineChartProps<T> {
  title: string;
  points: SeriesPoint<T>[];
  /** The value for a point, or `null` when that day carries no figure for this series. */
  valueOf: (value: T) => number | null;
  formatValue: (value: number) => string;
  /** Defaults to the first categorical slot. */
  color?: string;
  seriesLabel: string;
}

/**
 * A single-series line over time.
 *
 * **The line breaks across missing days rather than spanning them** (F3-DESIGN D3). Two things can
 * make a day missing, and both break the line for the same reason:
 *
 * - the whole day has no `daily_platform_stats` row (the stats job did not run that night);
 * - the day has a row but no entry for this currency (nothing was billed in it).
 *
 * Drawing a straight segment across either would assert a value nobody recorded. The break is the
 * honest mark, and `GapNote` explains it in words underneath.
 */
export function LineChart<T>({
  title,
  points,
  valueOf,
  formatValue,
  color = 'var(--chart-1)',
  seriesLabel,
}: LineChartProps<T>) {
  // Points this series actually has a number for. Days present in the response but null here are
  // dropped, which turns them into run boundaries below — exactly as a missing day is.
  const present = useMemo(
    () => points.filter((point) => valueOf(point.value) !== null),
    [points, valueOf],
  );

  const scale = useMemo(() => dayScale(present.map((point) => point.dayNumber)), [present]);
  const yScale = useMemo(
    () => linearScale(present.map((point) => valueOf(point.value) ?? 0)),
    [present, valueOf],
  );

  const runs = useMemo(() => toContiguousRuns(present), [present]);
  const xTicks = useDateTicks(present, scale.x);
  const { activeDay, onPointerMoveValue, onPointerLeave } = useNearestDay(present, scale.x);

  const active = present.find((point) => point.dayNumber === activeDay);
  const activeValue = active ? valueOf(active.value) : null;

  return (
    <ChartFrame
      title={title}
      yScale={yScale}
      formatY={formatValue}
      xTicks={xTicks}
      onPointerMoveValue={onPointerMoveValue}
      onPointerLeave={onPointerLeave}
      hover={
        active && activeValue !== null ? (
          <ChartTooltip
            leftPercent={(scale.x(active.dayNumber) / 960) * 100}
            title={shortDate(active.date)}
            rows={[{ label: seriesLabel, value: formatValue(activeValue), color }]}
          />
        ) : null
      }
    >
      {runs.map((run) => {
        const head = run[0];

        if (!head) {
          return null;
        }

        const path = run
          .map((point, index) => {
            const command = index === 0 ? 'M' : 'L';
            return `${command}${scale.x(point.dayNumber)} ${yScale.y(valueOf(point.value) ?? 0)}`;
          })
          .join(' ');

        return (
          <path
            key={head.date}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* A run of one day has no segment to draw, so it gets a marker — otherwise a single recorded
          day between two gaps would render as nothing at all. */}
      {runs.map((run) => {
        const only = run.length === 1 ? run[0] : undefined;

        return only ? (
          <circle
            key={`marker-${only.date}`}
            cx={scale.x(only.dayNumber)}
            cy={yScale.y(valueOf(only.value) ?? 0)}
            r={4}
            fill={color}
          />
        ) : null;
      })}

      {active && activeValue !== null ? (
        <g>
          <line
            x1={scale.x(active.dayNumber)}
            x2={scale.x(active.dayNumber)}
            y1={16}
            y2={yScale.y(yScale.min)}
            stroke="var(--chart-axis)"
            strokeWidth={1}
          />
          {/* A 2px surface ring keeps the marker legible where it overlaps the line. */}
          <circle
            cx={scale.x(active.dayNumber)}
            cy={yScale.y(activeValue)}
            r={5}
            fill={color}
            stroke="var(--card)"
            strokeWidth={2}
          />
        </g>
      ) : null}
    </ChartFrame>
  );
}
