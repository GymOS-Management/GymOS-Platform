'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, Pagination, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { StatusBadge } from '@/components/data/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { useDebounced } from '@/hooks/use-debounced';
import { gyms } from '@/lib/api/endpoints';
import { RequirePermission } from '@/lib/auth/session';
import { formatDate } from '@/lib/utils/format';
import { GYM_STATUSES, type GymListItem } from '@/types/api';

const PAGE_SIZE = 25;

/** "All statuses" needs a non-empty sentinel: Radix Select reserves '' for clearing. */
const ALL = 'all';

export default function GymsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ['gyms', 'list', { page, search: debouncedSearch, status, includeDeleted }],
    queryFn: ({ signal }) =>
      gyms.list(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status === ALL ? undefined : status,
          includeDeleted,
        },
        signal,
      ),
    // Keeps the previous page on screen while the next loads — a list that blanks on every
    // keystroke of the search box is unusable.
    placeholderData: keepPreviousData,
  });

  const columns: Column<GymListItem>[] = [
    { key: 'name', header: 'Name', primary: true, render: (gym) => gym.name },
    {
      key: 'slug',
      header: 'Address',
      render: (gym) => <span className="font-mono text-xs">{gym.slug}</span>,
    },
    { key: 'status', header: 'Status', render: (gym) => <StatusBadge status={gym.status} /> },
    { key: 'countryCode', header: 'Country', desktopOnly: true, render: (gym) => gym.countryCode },
    { key: 'ownerEmail', header: 'Owner', render: (gym) => gym.ownerEmail },
    {
      key: 'createdAtUtc',
      header: 'Created',
      desktopOnly: true,
      render: (gym) => formatDate(gym.createdAtUtc),
    },
  ];

  const hasFilters = debouncedSearch !== '' || status !== ALL;

  return (
    <>
      <PageHeader
        title="Gyms"
        actions={
          <RequirePermission permission="gyms.create">
            <Button asChild>
              <Link href="/gyms/new">
                <Plus className="h-4 w-4" aria-hidden />
                Provision gym
              </Link>
            </Button>
          </RequirePermission>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search name, address, or owner email…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search gyms"
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
            {GYM_STATUSES.map((value) => (
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
            checked={includeDeleted}
            onChange={(event) => {
              setIncludeDeleted(event.target.checked);
              setPage(1);
            }}
          />
          Include deleted
        </label>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(gym) => gym.id}
        loading={query.isPending}
        onRowClick={(gym) => router.push(`/gyms/${gym.id}`)}
        empty={
          hasFilters ? (
            <EmptyState
              icon={Building2}
              title="No gyms match these filters"
              description="Try a different search, or clear the status filter."
            />
          ) : (
            <EmptyState
              icon={Building2}
              title="No gyms yet"
              description="Provision the first gym to get started."
              action={
                <RequirePermission permission="gyms.create">
                  <Button asChild variant="outline">
                    <Link href="/gyms/new">Provision gym</Link>
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
  );
}
