'use client';

import type { ReactNode } from 'react';
import type { SeriesPoint } from '@/lib/analytics/series';

export interface SeriesColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
}

/**
 * The same series as a table.
 *
 * **Obligatory, not a courtesy** (F3-DESIGN D9). Three separate things land on it: the palette's
 * third slot sits below 3:1 on the light card surface, so the relief rule requires a table view or
 * visible direct labels; a 366-point chart is unreadable at 375px while a table is not; and it is
 * the path that lets an operator copy a number into an email.
 *
 * Only the days that exist appear — the table has no rows for missing days for exactly the reason
 * the chart has no line across them (D3).
 */
export function SeriesTable<T>({
  points,
  columns,
}: {
  points: readonly SeriesPoint<T>[];
  columns: SeriesColumn<T>[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border border-b text-left">
            <th scope="col" className="py-2 pr-4 font-medium">
              Date
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="py-2 pr-4 text-right font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date} className="border-border border-b last:border-0">
              <th scope="row" className="py-2 pr-4 text-left font-normal whitespace-nowrap">
                {point.date}
              </th>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="py-2 pr-4 text-right"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {column.render(point.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
