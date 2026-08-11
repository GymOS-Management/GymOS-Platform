'use client';

import { History } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { StatusBadge } from '@/components/data/status-badge';
import { subscriptions } from '@/lib/api/endpoints';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils/format';
import type { SubscriptionDetail } from '@/types/api';

/**
 * Every subscription record a gym has had, oldest decisions and all — including a `Canceled` row that
 * a later `Active` row does not erase, because the record of a gym having once cancelled (and its
 * `cancellationReason`) matters to a support conversation even after they're back.
 *
 * Background jobs move subscriptions to `PastDue`/`Expired` with no operator action, so this refetches
 * on window focus like the tab's other query, rather than only on mount.
 */
export function HistoryList({ gymId }: { gymId: string }) {
  const query = useQuery({
    queryKey: ['subscriptions', 'history', gymId],
    queryFn: ({ signal }) => subscriptions.history(gymId, signal),
    refetchOnWindowFocus: true,
  });

  const columns: Column<SubscriptionDetail>[] = [
    {
      key: 'plan',
      header: 'Plan',
      primary: true,
      render: (row) => (
        <span>
          {row.planName}{' '}
          <span className="text-muted-foreground font-mono text-xs">{row.planCode}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'period',
      header: 'Period',
      render: (row) =>
        `${formatDate(row.currentPeriodStartUtc)} – ${formatDate(row.currentPeriodEndUtc)}`,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => `${formatMoney(row.amount, row.currency)} / ${row.billingCycle}`,
    },
    {
      key: 'created',
      header: 'Created',
      desktopOnly: true,
      render: (row) => formatDateTime(row.createdAtUtc),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={query.data}
      rowKey={(row) => row.id}
      loading={query.isLoading}
      empty={
        <EmptyState
          icon={History}
          title="No subscription history yet"
          description="Records appear here once this gym has been assigned a plan."
        />
      }
    />
  );
}
