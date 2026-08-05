'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';

/**
 * The console's list surface, in two renderings from one column definition.
 *
 * From `md` up it is a table. Below `md` each row becomes a card, because a seven-column table on a
 * 360px screen degrades into a horizontal scroll where the operator can see the gym's name or its
 * status but never both — and the row actions fall off the edge entirely. The card shows the columns
 * marked `primary` prominently and the rest as label/value pairs.
 *
 * Sorting and paging are server-side (the API caps pageSize); this component only reports intent.
 */
export interface Column<T> {
  key: string;
  header: string;
  /** Shown as the card title on mobile rather than as a labelled row. */
  primary?: boolean;
  /** Hidden on the mobile card entirely — for columns only worth having when space is free. */
  desktopOnly?: boolean;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Rendered when there are zero rows — every list says *why* it is empty, not just that it is. */
  empty: React.ReactNode;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  /** Trailing cell that never collapses into the card body — the actions menu. */
  rowActions?: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
  rowActions,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full md:h-12" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return <>{empty}</>;
  }

  const sortIndicator = (key: string) =>
    sortBy === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : null;

  return (
    <>
      {/* Desktop: a real table, with real table semantics. */}
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b text-left">
              {columns.map((column) => (
                <th key={column.key} className="text-muted-foreground px-4 py-3 font-medium">
                  {column.sortable && onSort ? (
                    <button
                      type="button"
                      className="hover:text-foreground font-medium"
                      onClick={() => onSort(column.key)}
                    >
                      {column.header}
                      {sortIndicator(column.key)}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions && <th className="w-12 px-2 py-3" aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-b transition-colors last:border-0',
                  onRowClick && 'hover:bg-muted/50 cursor-pointer',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3">
                    {column.render(row)}
                  </td>
                ))}
                {rowActions && (
                  // Clicks in the action cell must not also open the row.
                  <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: one card per row. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => {
          const primaries = columns.filter((column) => column.primary);
          const secondaries = columns.filter((column) => !column.primary && !column.desktopOnly);

          return (
            <li
              key={rowKey(row)}
              className={cn(
                'bg-card rounded-md border p-4',
                onRowClick && 'active:bg-muted/50 cursor-pointer',
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  {primaries.map((column) => (
                    <div key={column.key} className="truncate font-medium">
                      {column.render(row)}
                    </div>
                  ))}
                </div>
                {rowActions && (
                  <div onClick={(event) => event.stopPropagation()}>{rowActions(row)}</div>
                )}
              </div>
              {secondaries.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {secondaries.map((column) => (
                    <div key={column.key} className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{column.header}</dt>
                      <dd className="truncate">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface PaginationProps {
  page: number;
  pageSize: number;
  /**
   * `number | string` because that is what the generated contract says: the backend's OpenAPI
   * generator declares int32s as either. Coerced here, once, rather than hand-editing the generated
   * types — which is exactly the drift AD-12 forbids.
   */
  totalCount: number | string;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, totalCount, onPageChange }: PaginationProps) {
  const total = Number(totalCount);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center justify-between gap-4 pt-4" aria-label="Pagination">
      <p className="text-muted-foreground text-sm">
        Page {page} of {totalPages}
        <span className="hidden sm:inline"> · {total} total</span>
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
