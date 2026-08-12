'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { ActivityFeed } from '@/features/dashboard/activity-feed';
import { HealthPanel } from '@/features/dashboard/health-panel';
import { SummaryPanels } from '@/features/dashboard/summary-panels';
import { usePermission } from '@/lib/auth/session';

/**
 * Where an operator lands: is the platform all right, and what has just happened.
 *
 * **Each panel resolves its own permission** rather than the page guarding once at the top
 * (F3-DESIGN D6). `/dashboard/activity` is gated on `audit.read` while the summary and health are
 * `analytics.read`, and `Analytics.md` §6 records that split as a decision: SupportAgent holds
 * `audit.read` and deliberately not `analytics.read`, because support work does not require seeing
 * what the platform earns. A page-level guard would either lock a support agent out of a screen they
 * are entitled to half of, or show them figures the API will refuse anyway.
 *
 * Per F1's standing rule, `usePermission` hides UI and never authorises — every panel's request is
 * re-checked server-side at both the endpoint policy and the request type.
 */
export default function DashboardPage() {
  const canReadAnalytics = usePermission('analytics.read');
  const canReadAudit = usePermission('audit.read');

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          canReadAnalytics ? (
            <>
              Live platform figures.{' '}
              <Link href="/analytics/revenue" className="underline underline-offset-2">
                Trends over time
              </Link>{' '}
              come from the nightly record.
            </>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {canReadAnalytics ? <SummaryPanels /> : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {canReadAudit ? <ActivityFeed /> : <div />}
          {canReadAnalytics ? <HealthPanel /> : null}
        </div>

        {!canReadAnalytics && !canReadAudit ? (
          // Reachable only if the landing-route fallback is bypassed by typing the URL. Says which
          // permission is missing rather than showing a blank screen.
          <p className="text-muted-foreground text-sm">
            You do not have permission to view platform analytics or the audit trail.
          </p>
        ) : null}
      </div>
    </>
  );
}
