'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { Activity } from 'lucide-react';
import { presentJobState } from '@/lib/monitoring/job-state';
import { formatDateTime, formatRelative } from '@/lib/utils/format';
import type { JobStateDto } from '@/types/api';

/**
 * Every registered job: schedule, last run, last success, next due, and the API's own state word.
 *
 * `stale` is rendered, never computed (F5-DESIGN D2). A failed run's `error` is shown exactly as
 * sent — bounded to type and message server-side (Monitoring.md §2), which is what makes this table
 * safe for SupportAgent to read.
 */
export function JobsTable({ jobs }: { jobs: readonly JobStateDto[] }) {
  const columns: Column<JobStateDto>[] = [
    {
      key: 'name',
      header: 'Job',
      primary: true,
      render: (job) => (
        <span className="flex flex-col">
          <Link
            href={`/monitoring/jobs/${encodeURIComponent(job.name)}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {job.name}
          </Link>
          <span className="text-muted-foreground text-xs">{job.schedule}</span>
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (job) => {
        const state = presentJobState(job);
        return (
          <span className="flex flex-col gap-1">
            <Badge tone={state.tone}>{state.label}</Badge>
            {job.lastRun?.error && (
              <span className="text-destructive text-xs break-words">{job.lastRun.error}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'lastRun',
      header: 'Last run',
      render: (job) =>
        job.lastRun ? (
          <span title={formatDateTime(job.lastRun.startedAtUtc)}>
            {formatRelative(job.lastRun.startedAtUtc)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'lastSuccess',
      header: 'Last success',
      desktopOnly: true,
      render: (job) => formatDateTime(job.lastSucceededAtUtc),
    },
    {
      key: 'nextDue',
      header: 'Next due',
      render: (job) => formatDateTime(job.nextDueUtc),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={[...jobs]}
      rowKey={(job) => job.name}
      empty={
        <EmptyState
          icon={Activity}
          title="No jobs registered"
          description="The job host has not described any job to the API."
        />
      }
    />
  );
}
