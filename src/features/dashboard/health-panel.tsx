'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { HealthRows, HealthUnreachableRow } from '@/features/monitoring/health-rows';
import { dashboard } from '@/lib/api/endpoints';

/**
 * The same health report `/health/ready` runs, per check.
 *
 * This is the one panel that polls (60s while the tab is visible). Its entire purpose is to be
 * current, and a health panel showing a stale "Healthy" is worse than showing nothing (D11).
 */
export function HealthPanel() {
  const query = useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: ({ signal }) => dashboard.health(signal),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Health</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-16" />
        ) : query.isError ? (
          <HealthUnreachableRow />
        ) : (
          <HealthRows health={query.data} />
        )}
      </CardContent>
    </Card>
  );
}
