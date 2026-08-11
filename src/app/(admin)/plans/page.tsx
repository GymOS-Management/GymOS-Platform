'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { CreditCard, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable, Pagination, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { StatusBadge } from '@/components/data/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { useDebounced } from '@/hooks/use-debounced';
import { plans } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { RequirePermission } from '@/lib/auth/session';
import type { PlanListItem } from '@/types/api';

const PAGE_SIZE = 25;

export default function PlansPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ['plans', 'list', { page, search: debouncedSearch, includeInactive }],
    queryFn: ({ signal }) =>
      plans.list(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          includeInactive,
        },
        signal,
      ),
    // Keeps the previous page on screen while the next loads — a list that blanks on every
    // keystroke of the search box is unusable.
    placeholderData: keepPreviousData,
    // Background jobs (renewals, price changes) move plan state with no action from the operator
    // looking at this screen, so — unlike the console's default — this query re-checks on focus.
    refetchOnWindowFocus: true,
  });

  const columns: Column<PlanListItem>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (plan) => <span className="font-mono text-xs">{plan.code}</span>,
    },
    { key: 'name', header: 'Name', primary: true, render: (plan) => plan.name },
    {
      key: 'trialDays',
      header: 'Trial days',
      desktopOnly: true,
      render: (plan) => plan.trialDays,
    },
    { key: 'priceCount', header: 'Prices', render: (plan) => plan.priceCount },
    {
      key: 'subscribedGymCount',
      header: 'Gyms',
      render: (plan) => plan.subscribedGymCount,
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (plan) => <StatusBadge status={plan.isActive ? 'Active' : 'Inactive'} />,
    },
    {
      key: 'isPublic',
      header: 'Visibility',
      desktopOnly: true,
      render: (plan) => (plan.isPublic ? 'Public' : 'Unlisted'),
    },
  ];

  const hasFilters = debouncedSearch !== '' || includeInactive;

  return (
    <>
      <PageHeader
        title="Plans"
        actions={
          <RequirePermission permission="billing.manage">
            <Button asChild>
              <Link href="/plans/new">
                <Plus className="h-4 w-4" aria-hidden />
                New plan
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search name or code…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search plans"
        />
        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              setPage(1);
            }}
          />
          Include withdrawn
        </label>
      </div>

      {query.isError ? (
        <p className="text-muted-foreground text-sm">
          {query.error instanceof ApiError ? query.error.message : 'Something went wrong.'}
        </p>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data?.items}
            rowKey={(plan) => plan.id}
            loading={query.isPending}
            onRowClick={(plan) => router.push(`/plans/${plan.id}`)}
            empty={
              hasFilters ? (
                <EmptyState
                  icon={CreditCard}
                  title="No plans match these filters"
                  description="Try a different search, or include withdrawn plans."
                />
              ) : (
                <EmptyState
                  icon={CreditCard}
                  title="No plans yet"
                  description="Create the first plan to start building the catalogue."
                  action={
                    <RequirePermission permission="billing.manage">
                      <Button asChild variant="outline">
                        <Link href="/plans/new">New plan</Link>
                      </Button>
                    </RequirePermission>
                  }
                />
              )
            }
          />

          {query.data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              totalCount={query.data.totalCount}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </>
  );
}
