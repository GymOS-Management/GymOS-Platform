'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboard } from '@/lib/api/endpoints';

/**
 * The same health report `/health/ready` runs, per check.
 *
 * **Status is never carried by colour alone**: every row pairs an icon with the status word. Two of
 * the four status colours sit below 3:1 on a light surface by design, so the icon and the label are
 * what make them readable — not a courtesy to add later.
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
          // A failed health request is itself a signal, and saying "unknown" is honest where
          // rendering nothing would read as "no problems".
          <StatusRow name="Health checks" status="Unreachable" />
        ) : (
          <div className="space-y-2">
            <StatusRow name="Overall" status={query.data.status} emphasis />
            {query.data.checks.map((check) => (
              <StatusRow key={check.name} name={check.name} status={check.status} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * ASP.NET Core reports `Healthy` / `Degraded` / `Unhealthy`. Anything else is shown as given with a
 * neutral icon rather than guessed at — a new state must degrade to "displayed", never to a crash or
 * to a reassuring green.
 */
const PRESENTATION: Record<string, { color: string; Icon: typeof CheckCircle2 }> = {
  Healthy: { color: 'var(--status-good)', Icon: CheckCircle2 },
  Degraded: { color: 'var(--status-warning)', Icon: AlertTriangle },
  Unhealthy: { color: 'var(--status-critical)', Icon: XCircle },
  Unreachable: { color: 'var(--status-serious)', Icon: HelpCircle },
};

function StatusRow({
  name,
  status,
  emphasis,
}: {
  name: string;
  status: string;
  emphasis?: boolean;
}) {
  const { color, Icon } = PRESENTATION[status] ?? {
    color: 'var(--chart-ink-muted)',
    Icon: HelpCircle,
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <span className={emphasis ? 'text-sm font-medium' : 'text-muted-foreground text-sm'}>
        {name}
      </span>
      <span className="flex items-center gap-1.5 text-sm">
        <Icon aria-hidden className="size-4 shrink-0" style={{ color }} />
        {status}
      </span>
    </div>
  );
}
