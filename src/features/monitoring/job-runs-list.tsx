'use client';

import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { formatDuration } from '@/lib/monitoring/format';
import { formatDateTime } from '@/lib/utils/format';
import { JOB_RUN_STATUSES, type JobRunDto, type JobRunStatus } from '@/types/api';

export type RunStatusFilter = JobRunStatus | 'all';

const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  Running: 'info',
  Succeeded: 'success',
  Failed: 'danger',
};

/**
 * A job's runs, newest first, with the status filter the API offers and "Load older" for the next
 * page (F5-DESIGN D4). Paging is by time, not by number: the container moves `to` to the oldest run
 * it has, as `hasMore` is defined (Monitoring.md §7).
 */
export function JobRunsList({
  runs,
  hasMore,
  loadingMore,
  status,
  onStatusChange,
  onLoadOlder,
}: {
  runs: readonly JobRunDto[];
  hasMore: boolean;
  loadingMore: boolean;
  status: RunStatusFilter;
  onStatusChange: (status: RunStatusFilter) => void;
  onLoadOlder: () => void;
}) {
  const columns: Column<JobRunDto>[] = [
    {
      key: 'startedAtUtc',
      header: 'Started',
      primary: true,
      render: (run) => formatDateTime(run.startedAtUtc),
    },
    {
      key: 'status',
      header: 'Status',
      render: (run) => (
        <span className="flex flex-col gap-1">
          <Badge tone={TONES[run.status] ?? 'neutral'}>{run.status}</Badge>
          {/* Exactly as sent — the backend bounds it to type and message (Monitoring.md §2). */}
          {run.error && <span className="text-destructive text-xs break-words">{run.error}</span>}
        </span>
      ),
    },
    { key: 'durationMs', header: 'Duration', render: (run) => formatDuration(run.durationMs) },
    {
      key: 'instance',
      header: 'Instance',
      desktopOnly: true,
      render: (run) => <span className="font-mono text-xs">{run.instance}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="run-status">Status</Label>
        <Select value={status} onValueChange={(value) => onStatusChange(value as RunStatusFilter)}>
          <SelectTrigger id="run-status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {JOB_RUN_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={[...runs]}
        rowKey={(run) => run.id}
        empty={
          <EmptyState
            icon={History}
            title="No runs recorded"
            description={
              status === 'all'
                ? 'This job has not run yet, or its history has passed the retention window.'
                : `No ${status.toLowerCase()} runs in the recorded history.`
            }
          />
        }
      />

      {hasMore && (
        <Button variant="outline" onClick={onLoadOlder} loading={loadingMore}>
          Load older
        </Button>
      )}
    </div>
  );
}
