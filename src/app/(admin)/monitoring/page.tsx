'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { HealthRows } from '@/features/monitoring/health-rows';
import { JobsTable } from '@/features/monitoring/jobs-table';
import { OutboxTile } from '@/features/monitoring/outbox-tile';
import { ProcessTile } from '@/features/monitoring/process-tile';
import { monitoring } from '@/lib/api/endpoints';

/**
 * Is the platform healthy right now (F5-DESIGN D1). Its own screen, not dashboard panels, because
 * SupportAgent holds `monitoring.read` and not `analytics.read` (Monitoring.md §8).
 *
 * Polled every 60 seconds while visible, like the dashboard's health panel: the whole point of the
 * page is to be current. Two endpoints per minute per open tab is deliberate and cheap (spec §7).
 */
export default function MonitoringPage() {
  const query = useQuery({
    queryKey: ['monitoring', 'overview'],
    queryFn: ({ signal }) => monitoring.overview(signal),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Monitoring"
        description="Health, this replica's process, outbox depth, and whether every scheduled job has run. Refreshes each minute."
      />

      {query.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : query.isError ? (
        <ApiErrorText error={query.error} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Health</CardTitle>
              </CardHeader>
              <CardContent>
                <HealthRows health={query.data.health} />
              </CardContent>
            </Card>
            <ProcessTile process={query.data.process} />
            <OutboxTile outbox={query.data.outbox} />
          </div>

          <section aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="mb-3 text-lg font-semibold">
              Jobs
            </h2>
            <JobsTable jobs={query.data.jobs} />
          </section>
        </div>
      )}
    </>
  );
}
