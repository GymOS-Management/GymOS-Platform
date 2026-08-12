'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The pieces every chart shares: a legend, a hover card, an empty state, and the gap note.
 *
 * Identity is never carried by colour alone — a legend is present whenever there are two or more
 * series, and every swatch is paired with its label. The light-mode palette's third slot sits below
 * 3:1 against the card surface (recorded in `globals.css`), so the label beside it is what makes it
 * readable, not a nicety.
 */

export interface LegendEntry {
  label: string;
  /** A CSS colour, normally `var(--chart-N)`. */
  color: string;
}

export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length < 2) {
    // One series needs no legend: the card title already names it, and a legend box for a single
    // entry is chrome that says nothing.
    return null;
  }

  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
      {entries.map((entry) => (
        <li key={entry.label} className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color }}
          />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The hover card. Positioned in percentage terms so it tracks the scaled viewBox, and flipped to the
 * left of the pointer past the halfway mark so it never runs off the right edge.
 */
export function ChartTooltip({
  leftPercent,
  title,
  rows,
}: {
  leftPercent: number;
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  const flip = leftPercent > 55;

  return (
    <div
      className={cn(
        'border-border bg-popover pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border p-2.5 shadow-md',
        flip ? '-translate-x-full' : 'translate-x-0',
      )}
      style={{ left: `${flip ? leftPercent - 1 : leftPercent + 1}%` }}
      role="status"
    >
      <p className="text-popover-foreground mb-1.5 text-xs font-medium">{title}</p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              {row.color ? (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: row.color }}
                />
              ) : null}
              {row.label}
            </span>
            <span
              className="text-popover-foreground font-medium"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Shown when a range came back with no rows at all.
 *
 * Says "nothing was recorded", not "no data" — the difference matters here, because an empty range
 * means the nightly job wrote no row for those days, which is a fact about the platform rather than
 * a fact about the query.
 */
export function ChartEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="border-border text-muted-foreground flex min-h-48 items-center justify-center rounded-md border border-dashed px-6 py-10 text-center text-sm">
      {children}
    </div>
  );
}

/**
 * The gap note (F3-DESIGN D3). Rendered whenever a series has missing days, so a broken line is
 * explained on the screen rather than looking like a rendering fault.
 */
export function GapNote({ note }: { note: string | null }) {
  if (note === null) {
    return null;
  }

  return (
    <p className="text-muted-foreground mt-3 text-xs" data-testid="gap-note">
      {note}
    </p>
  );
}

/**
 * Says where a number came from and how fresh it is (F3-DESIGN D7).
 *
 * The dashboard is computed live; the analytics series are a read model written once a night. So
 * assigning a gym moves a KPI immediately and moves no chart until the next night's job has run —
 * correct, permanent, and guaranteed to look like a bug to anyone who notices it without being told.
 */
export function Provenance({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground text-xs">{children}</p>;
}
