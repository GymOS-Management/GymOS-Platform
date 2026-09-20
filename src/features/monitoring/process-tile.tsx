import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCpu, formatMegabytes, formatSeconds } from '@/lib/monitoring/format';
import { formatDateTime } from '@/lib/utils/format';
import type { ProcessMetrics } from '@/types/api';

/**
 * One replica's own view of itself, and labelled as such (F5-DESIGN D3; Monitoring.md §6).
 *
 * The title carries `instance` because with several replicas these numbers describe whichever one
 * answered — presenting them as "the platform's CPU" is the misreading §10 warns a console against.
 * Fleet-wide figures are App Insights'.
 */
export function ProcessTile({ process }: { process: ProcessMetrics | null }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Process{process ? ` · ${process.instance}` : ''}
        </CardTitle>
        <CardDescription>
          This replica only. Fleet-wide figures live in App Insights.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {process === null ? (
          // Null until the sampler's first reading, a few seconds after start-up.
          <p className="text-muted-foreground text-sm">No sample yet.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <Metric label="CPU" value={formatCpu(process.cpuPercent) ?? 'Warming up'} />
            <Metric label="Memory" value={formatMegabytes(process.workingSetMb)} />
            <Metric label="Uptime" value={formatSeconds(process.uptimeSeconds)} />
            <p className="text-muted-foreground col-span-3 text-xs">
              Sampled {formatDateTime(process.sampledAtUtc)}
            </p>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
