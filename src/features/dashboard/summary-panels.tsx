'use client';

import { useQuery } from '@tanstack/react-query';
import { StatTile } from '@/components/data/stat-tile';
import { Provenance } from '@/components/charts/chart-parts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboard } from '@/lib/api/endpoints';
import { formatMoney } from '@/lib/utils/format';

/**
 * The live half of the dashboard: gym population, live subscriptions, and MRR.
 *
 * **Live, not recorded** (`Analytics.md` §1): these are computed from `gyms` and `gym_subscriptions`
 * on every request, so they move the moment a gym is assigned — while no `/analytics` chart moves
 * until the next night's stats job has run. Both surfaces say so on screen (F3-DESIGN D7), because
 * the discrepancy is permanent and looks like a bug to anyone who notices it uninformed.
 *
 * Refetches on window focus: sweeps change subscription state with nobody clicking, and a stale
 * "everything is fine" is the worst thing this screen can show (D11).
 */
export function SummaryPanels() {
  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: ({ signal }) => dashboard.summary(signal),
    refetchOnWindowFocus: true,
  });

  if (query.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-4 text-sm">
          The platform summary could not be loaded.
        </CardContent>
      </Card>
    );
  }

  const summary = query.data;

  return (
    <section aria-labelledby="summary-heading" className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="summary-heading" className="text-sm font-medium">
          Platform
        </h2>
        <Provenance>Live · as of now</Provenance>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gyms" value={Number(summary.totalGyms).toLocaleString()} />
        <StatTile label="Active" value={Number(summary.activeGyms).toLocaleString()} />
        <StatTile
          label="Suspended"
          value={Number(summary.suspendedGyms).toLocaleString()}
          hint={
            Number(summary.provisioningGyms) > 0
              ? `${Number(summary.provisioningGyms).toLocaleString()} provisioning`
              : undefined
          }
        />
        <StatTile
          label="Live subscriptions"
          value={Number(summary.liveSubscriptions).toLocaleString()}
        />
      </div>

      <MrrPanel mrr={summary.mrr} />
    </section>
  );
}

/**
 * Monthly recurring revenue, **one figure per currency**.
 *
 * `Analytics.md` §4 is explicit that MRR is computed per currency and never coerced into one number:
 * summing unlike currencies needs an exchange-rate policy (AD-43) that nobody has decided. The array
 * is a **permanent** part of the v1 contract — AD-43 will add a converted total alongside it, never
 * replace it — so there is deliberately no code path here that produces a combined figure
 * (F3-DESIGN D2).
 */
export function MrrPanel({ mrr }: { mrr: { amount: number | string; currency: string }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Monthly recurring revenue</CardTitle>
      </CardHeader>
      <CardContent>
        {mrr.length === 0 ? (
          // Not "€0.00": no paying subscription and zero revenue are different facts, and a
          // currency-less zero would have to invent a currency to render at all.
          <p className="text-muted-foreground text-sm">No paying subscriptions yet.</p>
        ) : (
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            {mrr.map((money) => (
              <div key={money.currency}>
                <p className="text-2xl font-semibold sm:text-3xl">
                  {formatMoney(money.amount, money.currency)}
                </p>
                <p className="text-muted-foreground text-xs">{money.currency} per month</p>
              </div>
            ))}
          </div>
        )}
        {mrr.length > 1 ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Shown per currency and never added together — a combined figure needs an exchange-rate
            policy the platform has not adopted.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
