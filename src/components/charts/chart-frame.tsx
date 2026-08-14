'use client';

import { type ReactNode, useId, useMemo, useRef, useState } from 'react';

/**
 * The shared plot area every F3 chart draws into: a viewBox, a y-scale, gridlines, and the two axes.
 *
 * **Why an owned SVG rather than a charting library** (F3-DESIGN D1): the dependency policy prefers
 * the platform, and three fixed forms over at most 366 daily points do not justify pulling a dozen
 * `d3-*` packages into the tree. The cost is that the axis maths, the hover layer and the keyboard
 * path live here.
 *
 * **Why a scaled viewBox rather than a measured container**: the SVG declares a fixed coordinate
 * space and CSS scales it to the column it sits in, so there is no `ResizeObserver` and no layout
 * read — which also means the charts render identically under jsdom, where there is no layout at
 * all. The trade-off is that labels scale with the chart instead of holding a constant pixel size;
 * the type sizes below are chosen to stay legible at the narrowest column this console has.
 */

export const PLOT = {
  width: 960,
  height: 320,
  padding: { top: 16, right: 20, bottom: 34, left: 62 },
} as const;

export const INNER_WIDTH = PLOT.width - PLOT.padding.left - PLOT.padding.right;
export const INNER_HEIGHT = PLOT.height - PLOT.padding.top - PLOT.padding.bottom;

export interface YScale {
  min: number;
  max: number;
  /** Value -> y coordinate in the viewBox. */
  y: (value: number) => number;
  ticks: number[];
}

/**
 * A y-scale that always includes zero and ends on a round number.
 *
 * Always including zero is a deliberate refusal: a bar or area chart whose baseline is not zero
 * exaggerates every difference on it, and truncating the axis is the most common way an honest
 * number becomes a misleading picture.
 */
export function linearScale(values: readonly number[], tickCount = 4): YScale {
  const highest = values.length > 0 ? Math.max(...values) : 0;

  // Integral data gets integral ticks.
  //
  // Counting gyms, churn events and new signups produces whole numbers, and small whole numbers are
  // the normal case on a young platform — where `niceCeiling` divided by four labelled them in
  // quarters. A day with 3 new gyms gave a ceiling of 5 and an axis reading 0, 1.25, 2.5, 3.75, 5:
  // quarters of a gym. Money is a different matter, so the rule applies only when every value is
  // already an integer.
  const integral = values.every((value) => Number.isInteger(value));
  const { max, step, count } = integral
    ? integerAxis(Math.max(highest, 0), tickCount)
    : fractionalAxis(Math.max(highest, 0), tickCount);

  const min = 0;
  const span = max - min || 1;

  const y = (value: number) =>
    PLOT.padding.top + INNER_HEIGHT - ((value - min) / span) * INNER_HEIGHT;

  const ticks = Array.from({ length: count + 1 }, (_, index) => min + step * index);

  return { min, max, y, ticks };
}

/** The original behaviour, unchanged: a nice ceiling cut into `tickCount` equal parts. */
function fractionalAxis(highest: number, tickCount: number) {
  const max = niceCeiling(highest);

  return { max, step: max / tickCount, count: tickCount };
}

/**
 * An axis whose step is a whole number a person would say — 1, 2, 5, 10, 20, 50 … — and whose top
 * tick is the smallest such step times a tick count that still covers the data.
 *
 * Four intervals are tried before five, so the axis stays as tight as it can: 42 becomes 0–50 in tens
 * rather than 0–80 in twenties.
 */
function integerAxis(highest: number, tickCount: number) {
  for (let magnitude = 1; magnitude <= 1e9; magnitude *= 10) {
    for (const unit of [1, 2, 5]) {
      const step = unit * magnitude;

      for (const count of [tickCount, tickCount + 1]) {
        if (step * count >= highest) {
          return { max: step * count, step, count };
        }
      }
    }
  }

  return fractionalAxis(highest, tickCount);
}

/** Rounds up to 1, 2, 2.5 or 5 x a power of ten, so tick labels read as numbers a person would say. */
function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => normalised <= candidate) ?? 10;

  return step * magnitude;
}

/**
 * X positions for a set of day numbers.
 *
 * **Positioned by date, never by index** (F3-DESIGN D3): a missing day has to leave a hole the width
 * of a day, and indexing the returned points would close that hole and hide it.
 */
export function dayScale(dayNumbers: readonly number[]) {
  const first = dayNumbers.length > 0 ? Math.min(...dayNumbers) : 0;
  const last = dayNumbers.length > 0 ? Math.max(...dayNumbers) : 1;
  const span = last - first || 1;

  return {
    first,
    last,
    span,
    x: (dayNumber: number) => PLOT.padding.left + ((dayNumber - first) / span) * INNER_WIDTH,
    /** Column width for one day, floored so a single-day range still draws something visible. */
    bandWidth: Math.max(INNER_WIDTH / (span + 1), 3),
  };
}

export interface ChartFrameProps {
  /** Names what the chart shows, for screen readers. The visible title lives in the card header. */
  title: string;
  yScale: YScale;
  /** Tick label formatter — currency-aware on revenue, plain counts elsewhere. */
  formatY: (value: number) => string;
  xTicks: { x: number; label: string }[];
  children: ReactNode;
  /** Rendered above the plot on hover, positioned by the caller's pointer handling. */
  hover?: ReactNode;
  onPointerMoveValue?: (viewBoxX: number) => void;
  onPointerLeave?: () => void;
}

export function ChartFrame({
  title,
  yScale,
  formatY,
  xTicks,
  children,
  hover,
  onPointerMoveValue,
  onPointerLeave,
}: ChartFrameProps) {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-labelledby={titleId}
        onPointerMove={(event) => {
          if (!onPointerMoveValue || !svgRef.current) {
            return;
          }

          // Client pixels -> viewBox units. The SVG is scaled by CSS, so the ratio is the only
          // reliable conversion; `getBoundingClientRect` is read per event rather than cached
          // because the column resizes with the window.
          const bounds = svgRef.current.getBoundingClientRect();
          if (bounds.width === 0) {
            return;
          }

          onPointerMoveValue(((event.clientX - bounds.left) / bounds.width) * PLOT.width);
        }}
        onPointerLeave={onPointerLeave}
      >
        <title id={titleId}>{title}</title>

        {yScale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PLOT.padding.left}
              x2={PLOT.width - PLOT.padding.right}
              y1={yScale.y(tick)}
              y2={yScale.y(tick)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={PLOT.padding.left - 10}
              y={yScale.y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={13}
              fill="var(--chart-ink-muted)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatY(tick)}
            </text>
          </g>
        ))}

        {/* Baseline drawn after the grid so it reads as the axis rather than another gridline. */}
        <line
          x1={PLOT.padding.left}
          x2={PLOT.width - PLOT.padding.right}
          y1={yScale.y(yScale.min)}
          y2={yScale.y(yScale.min)}
          stroke="var(--chart-axis)"
          strokeWidth={1}
        />

        {children}

        {xTicks.map((tick) => (
          <text
            key={`${tick.x}-${tick.label}`}
            x={tick.x}
            y={PLOT.height - PLOT.padding.bottom + 20}
            textAnchor="middle"
            fontSize={13}
            fill="var(--chart-ink-muted)"
          >
            {tick.label}
          </text>
        ))}
      </svg>

      {hover}
    </div>
  );
}

/**
 * At most `count` evenly spaced date labels, so a 366-day range does not stack 366 of them.
 *
 * The labels are chosen from days that actually exist in the series — a tick under a day nothing was
 * recorded for would imply the axis is continuous when the data is not.
 */
export function useDateTicks(
  points: readonly { date: string; dayNumber: number }[],
  x: (dayNumber: number) => number,
  count = 6,
): { x: number; label: string }[] {
  return useMemo(() => {
    if (points.length === 0) {
      return [];
    }

    const stride = Math.max(1, Math.ceil(points.length / count));
    const chosen = points.filter((_, index) => index % stride === 0);

    return chosen.map((point) => ({ x: x(point.dayNumber), label: shortDate(point.date) }));
  }, [points, x, count]);
}

/** `2026-08-12` -> `12 Aug`. Year omitted: the range control already states it. */
export function shortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Tracks which day the pointer is nearest, for the crosshair and tooltip. */
export function useNearestDay(
  points: readonly { dayNumber: number }[],
  x: (day: number) => number,
) {
  const [activeDay, setActiveDay] = useState<number | null>(null);

  const onPointerMoveValue = (viewBoxX: number) => {
    let nearest: number | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const point of points) {
      const distance = Math.abs(x(point.dayNumber) - viewBoxX);

      if (distance < nearestDistance) {
        nearest = point.dayNumber;
        nearestDistance = distance;
      }
    }

    if (nearest !== null) {
      setActiveDay(nearest);
    }
  };

  return { activeDay, onPointerMoveValue, onPointerLeave: () => setActiveDay(null) };
}
