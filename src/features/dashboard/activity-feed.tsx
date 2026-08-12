'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboard } from '@/lib/api/endpoints';
import { describeAuditAction, describeEntityType } from '@/lib/utils/audit';
import { formatDateTime } from '@/lib/utils/format';

const ENTRY_LIMIT = 20;

/**
 * The audit log in a trimmed shape — the last things that happened, on the screen an operator opens
 * first.
 *
 * **Gated on `audit.read`, not `analytics.read`** (`Analytics.md` §6). The split is deliberate:
 * SupportAgent holds the first and not the second, because answering "why is POS off for this gym?"
 * does not require seeing what the platform earns. That is why this panel resolves its own
 * permission and the dashboard does not guard once at the top (F3-DESIGN D6) — a support agent gets
 * this feed and no revenue, rather than an empty page or a locked door.
 */
export function ActivityFeed() {
  const query = useQuery({
    queryKey: ['dashboard', 'activity', ENTRY_LIMIT],
    queryFn: ({ signal }) => dashboard.activity(ENTRY_LIMIT, signal),
    refetchOnWindowFocus: true,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 pb-2">
        <CardTitle className="text-sm font-medium">Recent activity</CardTitle>
        <Link href="/audit-logs" className="text-muted-foreground text-xs hover:underline">
          Full audit log
        </Link>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-8" />
            ))}
          </div>
        ) : query.isError ? (
          <p className="text-muted-foreground text-sm">Recent activity could not be loaded.</p>
        ) : query.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {query.data.map((entry, index) => (
              <li
                key={`${entry.occurredAtUtc}-${entry.action}-${index}`}
                className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                {/* Same reading as the audit log's own list — this feed is that trail in a trimmed
                    shape, and humanising one screen while leaving the other in machine codes would
                    make them look like different things. */}
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{describeAuditAction(entry.action)}</span>{' '}
                  <span className="text-muted-foreground">
                    {describeEntityType(entry.entityType)}
                  </span>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {/* Sign-in rows carry no user id by design — at sign-in the caller is not yet
                      authenticated — so an absent email is expected rather than missing data. */}
                  {entry.userEmail ?? 'System'} · {formatDateTime(entry.occurredAtUtc)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
