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
import { describeAuditAction, describeEntityType, shortId } from '@/lib/utils/audit';
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
      // The sentence first, the code under it. The code stays because it is what the filter above
      // matches and what an operator quotes; it just stops being the only thing on offer.
      render: (entry) => (
        <span className="flex flex-col">
          <span className="font-medium">{describeAuditAction(entry.action)}</span>
          <span className="text-muted-foreground font-mono text-xs">{entry.action}</span>
        </span>
      ),
    },
    {
      key: 'userEmail',
      header: 'By',
      render: (entry) =>
        entry.userEmail ?? (
          // "System" rather than "system", and titled: a null actor is not an anonymous mystery, it
          // is a background job or a step that ran before anyone was authenticated (a sign-in stamps
          // the user's own row before the caller has an identity).
          <span
            className="text-muted-foreground"
            title="No signed-in user — a background job or a pre-authentication step"
          >
            System
          </span>
        ),
    },
    {
      key: 'entityType',
      header: 'Subject',
      desktopOnly: true,
      // Which thing, not just what kind of thing. The type alone could not tell two gyms apart, so
      // the id's first segment rides along — enough to spot the rows that share a subject.
      render: (entry) => {
        const type = describeEntityType(entry.entityType);
        const id = shortId(entry.entityId);

        if (!type) {
          return <span className="text-muted-foreground">—</span>;
        }

        return (
          <span className="flex flex-col">
            <span>{type}</span>
            {id && <span className="text-muted-foreground font-mono text-xs">{id}…</span>}
          </span>
        );
      },
    },
    {
      key: 'ipAddress',
      header: 'From',
      desktopOnly: true,
      // Already carried by the API and previously dropped on the floor. On a trail whose job is
      // answering "who did this", where they did it from is half the question.
      render: (entry) =>
        entry.ipAddress ? (
          <span className="font-mono text-xs">{entry.ipAddress}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
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
              <DialogTitle className="text-base">
                {describeAuditAction(query.data.summary.action)}
              </DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {query.data.summary.action}
              </DialogDescription>
            </DialogHeader>

            {/*
              Everything the entry knows, labelled — rather than a run-on line of values the reader
              has to attribute themselves. `userAgent` in particular was already being fetched and
              then dropped, which is the sort of thing a security review asks for by name.
            */}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Fact label="By">
                {query.data.summary.userEmail ?? (
                  <span className="text-muted-foreground">
                    System — no signed-in user (a background job, or a step before authentication)
                  </span>
                )}
              </Fact>
              <Fact label="When">{formatDateTime(query.data.summary.createdAtUtc)}</Fact>
              <Fact label="Subject">
                {describeEntityType(query.data.summary.entityType) ?? '—'}
                {query.data.summary.entityId && (
                  <span className="text-muted-foreground ml-2 font-mono text-xs break-all">
                    {query.data.summary.entityId}
                  </span>
                )}
              </Fact>
              <Fact label="From">
                {query.data.summary.ipAddress ? (
                  <span className="font-mono text-xs">{query.data.summary.ipAddress}</span>
                ) : (
                  '—'
                )}
              </Fact>
              <Fact label="Client">
                {query.data.userAgent ? (
                  <span className="text-xs break-all">{query.data.userAgent}</span>
                ) : (
                  '—'
                )}
              </Fact>
              <Fact label="Correlation">
                {query.data.summary.correlationId ? (
                  // The id that ties this entry to every log line and every other entry from the
                  // same request — the thing you actually search on when reconstructing an incident.
                  <span className="font-mono text-xs break-all">
                    {query.data.summary.correlationId}
                  </span>
                ) : (
                  '—'
                )}
              </Fact>
            </dl>

            <AuditDiffViewer oldValues={query.data.oldValues} newValues={query.data.newValues} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
