'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pagination } from '@/components/data/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { InvoiceTable } from '@/features/invoices/invoice-table';
import { useDebounced } from '@/hooks/use-debounced';
import { invoices } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { INVOICE_STATUSES } from '@/types/api';

const PAGE_SIZE = 25;

/** "All statuses" needs a non-empty sentinel: Radix Select reserves '' for clearing. */
const ALL = 'all';

/**
 * Every invoice across every gym — the billing team's own worklist, as opposed to the gym detail
 * page's Invoices tab which is scoped to one tenant.
 *
 * The overdue sweep relabels `Issued` invoices to `Overdue` with no operator action, so — like the
 * gym-scoped Invoices tab — this refetches on window focus rather than only on mount.
 */
export default function InvoicesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ['invoices', 'list', { page, search: debouncedSearch, status, overdueOnly }],
    queryFn: ({ signal }) =>
      invoices.list(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status === ALL ? undefined : status,
          overdue: overdueOnly || undefined,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });

  const hasFilters = debouncedSearch !== '' || status !== ALL || overdueOnly;

  return (
    <>
      <PageHeader title="Invoices" />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search invoice number…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search invoices"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {INVOICE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={overdueOnly}
            onChange={(event) => {
              setOverdueOnly(event.target.checked);
              setPage(1);
            }}
          />
          Overdue only
        </label>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" aria-busy="true" />
      ) : query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error instanceof ApiError ? query.error.message : 'Something went wrong.'}
        </p>
      ) : (
        <>
          <InvoiceTable
            invoices={query.data.items}
            emptyMessage={hasFilters ? 'No invoices match these filters' : 'No invoices yet'}
            onRowClick={(invoice) => router.push(`/invoices/${invoice.id}`)}
          />

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={query.data.totalCount}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
