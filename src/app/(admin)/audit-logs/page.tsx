'use client';

import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AuditDiffViewer } from '@/components/data/audit-diff-viewer';
import { DataTable, Pagination, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { useDebounced } from '@/hooks/use-debounced';
import { auditLogs } from '@/lib/api/endpoints';
import { formatDateTime } from '@/lib/utils/format';
import type { AuditLogListItem } from '@/types/api';

const PAGE_SIZE = 50;

/**
 * The trail that makes every other screen accountable. Read-only by design — the API has no write
 * endpoints here, permanently.
 *
 * The action filter is a prefix ("gym." finds created/updated/deleted; "auth." finds sign-ins),
 * matching how the API filters and how the naming convention nests.
 */
export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedAction = useDebounced(action, 300);

  const query = useQuery({
    queryKey: ['audit-logs', 'list', { page, action: debouncedAction }],
    queryFn: ({ signal }) =>
      auditLogs.list({ page, pageSize: PAGE_SIZE, action: debouncedAction || undefined }, signal),
    placeholderData: keepPreviousData,
  });

  const columns: Column<AuditLogListItem>[] = [
    {
      key: 'action',
      header: 'Action',
      primary: true,
      render: (entry) => <span className="font-mono text-xs">{entry.action}</span>,
    },
    {
      key: 'userEmail',
      header: 'By',
      render: (entry) => entry.userEmail ?? <span className="text-muted-foreground">system</span>,
    },
    {
      key: 'entityType',
      header: 'Entity',
      desktopOnly: true,
      render: (entry) => entry.entityType ?? '—',
    },
    {
      key: 'createdAtUtc',
      header: 'When',
      render: (entry) => formatDateTime(entry.createdAtUtc),
    },
  ];

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action, append-only. Click an entry for the before/after values."
      />

      <div className="mb-4">
        <Input
          type="search"
          placeholder="Filter by action prefix, e.g. gym. or auth.…"
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
          className="sm:max-w-sm"
          aria-label="Filter by action"
        />
      </div>

      <DataTable
        columns={columns}
        rows={query.data?.items}
        rowKey={(entry) => entry.id}
        loading={query.isPending}
        onRowClick={(entry) => setSelectedId(entry.id)}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No entries match"
            description="Try a broader action prefix — e.g. just “gym.”."
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

      <AuditEntryDialog entryId={selectedId} onClose={() => setSelectedId(null)} />
    </>
  );
}

function AuditEntryDialog({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['audit-logs', 'detail', entryId],
    queryFn: ({ signal }) => auditLogs.get(entryId!, signal),
    enabled: entryId !== null,
  });

  return (
    <Dialog open={entryId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {query.isPending && <Skeleton className="h-48 w-full" aria-busy="true" />}
        {query.data && (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono text-base">{query.data.summary.action}</DialogTitle>
              <DialogDescription>
                {query.data.summary.userEmail ?? 'system'} ·{' '}
                {formatDateTime(query.data.summary.createdAtUtc)}
                {query.data.summary.correlationId && (
                  <span className="mt-1 block font-mono text-xs">
                    correlation {query.data.summary.correlationId}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <AuditDiffViewer oldValues={query.data.oldValues} newValues={query.data.newValues} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
