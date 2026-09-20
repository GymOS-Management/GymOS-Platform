import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCount, formatSeconds } from '@/lib/monitoring/format';
import type { OutboxDepth } from '@/types/api';

/**
 * Depth only, and the payload's own `note` says why (F5-DESIGN D3; Monitoring.md §5).
 *
 * Printed verbatim: the backend wrote that sentence so a console showing depth without lag would
 * not need a wiki page to explain the gap, and paraphrasing it here would put the explanation back
 * in a place that rots.
 */
export function OutboxTile({ outbox }: { outbox: OutboxDepth }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Outbox</CardTitle>
        <CardDescription>{outbox.note}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <Figure label="Messages" value={formatCount(outbox.totalMessages)} />
          <Figure label="Last 24 h" value={formatCount(outbox.messagesLast24h)} />
          <Figure label="Oldest" value={formatSeconds(outbox.oldestMessageAgeSeconds)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
