'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { UserPlus, Users as UsersIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
import { InviteUserDialog } from '@/features/users/invite-user-dialog';
import { useDebounced } from '@/hooks/use-debounced';
import { users } from '@/lib/api/endpoints';
import { RequirePermission } from '@/lib/auth/session';
import { formatRelative } from '@/lib/utils/format';
import { USER_STATUSES, type UserListItem } from '@/types/api';

const PAGE_SIZE = 25;
const ALL = 'all';

export default function UsersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [inviteOpen, setInviteOpen] = useState(false);
  const debouncedSearch = useDebounced(search, 300);

  const query = useQuery({
    queryKey: ['users', 'list', { page, search: debouncedSearch, status }],
    queryFn: ({ signal }) =>
      users.list(
        {
          page,
          pageSize: PAGE_SIZE,
          search: debouncedSearch || undefined,
          status: status === ALL ? undefined : status,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  const columns: Column<UserListItem>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (user) => `${user.firstName} ${user.lastName}`,
    },
    { key: 'email', header: 'Email', render: (user) => user.email },
    { key: 'status', header: 'Status', render: (user) => <StatusBadge status={user.status} /> },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) => (
        <span className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            user.roles.map((role) => (
              <Badge key={role} tone="outline">
                {role}
              </Badge>
            ))
          )}
        </span>
      ),
    },
    {
      key: 'lastLoginAtUtc',
      header: 'Last sign-in',
      desktopOnly: true,
      render: (user) => formatRelative(user.lastLoginAtUtc),
    },
  ];

  return (
    <>
      <PageHeader
        title="Administrators"
        actions={
          <RequirePermission permission="users.manage">
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Invite
            </Button>
          </RequirePermission>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="search"
          placeholder="Search email or name…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-xs"
          aria-label="Search administrators"
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {USER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(user) => user.id}
        loading={query.isPending}
        onRowClick={(user) => router.push(`/users/${user.id}`)}
        empty={
          <EmptyState
            icon={UsersIcon}
            title="No administrators match"
            description="Try a different search or status."
          />
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

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
