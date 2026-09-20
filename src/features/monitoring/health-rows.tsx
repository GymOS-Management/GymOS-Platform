import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import type { DashboardHealth } from '@/types/api';

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

/**
 * **Status is never carried by colour alone**: every row pairs an icon with the status word. Two of
 * the four status colours sit below 3:1 on a light surface by design, so the icon and the label are
 * what make them readable — not a courtesy to add later.
 */
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

/** The overall status first, then one row per check — the same rows on the dashboard and on /monitoring. */
export function HealthRows({ health }: { health: DashboardHealth }) {
  return (
    <div className="space-y-2">
      <StatusRow name="Overall" status={health.status} emphasis />
      {health.checks.map((check) => (
        <StatusRow key={check.name} name={check.name} status={check.status} />
      ))}
    </div>
  );
}

/** A failed health request is itself a signal; "Unreachable" is honest where nothing would read as "fine". */
export function HealthUnreachableRow() {
  return <StatusRow name="Health checks" status="Unreachable" />;
}
