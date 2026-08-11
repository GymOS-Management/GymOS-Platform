import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/data/status-badge';
import { formatDate, formatMoney } from '@/lib/utils/format';
import type { SubscriptionDetail } from '@/types/api';

/**
 * A gym's current subscription, read as prose rather than a bare status badge.
 *
 * Three facts are routinely misread from status alone, so each gets an explicit sentence next to the
 * badge instead of relying on the badge's colour to carry the meaning:
 *
 * - `cancelAtPeriodEnd` (D7): the gym is *paid through* the current period and keeps access until it
 *   ends — a scheduled cancellation is not a cancelled subscription, so the copy leads with "Active".
 * - `status === 'PastDue'`: late payment, not withheld service. Withholding service is a gym
 *   *suspension*, a separate act on the gym's own status controls, not this screen.
 * - `pendingChange`: a plan change that has not happened yet — it takes effect at the next renewal.
 *   `PendingPlanChangeDetail` (src/types/api.d.ts) carries only `planId`, not a name, so the caller
 *   resolves one (from `plans.list`) and passes it as `pendingPlanName`; without it we fall back to
 *   the id rather than inventing a field the API doesn't send.
 *
 * `onResume`/`onConvertTrial` are optional and rendered only when `canManage` — they sit here rather
 * than in a separate action bar because each undoes or advances exactly the fact printed on the line
 * next to it (D-nearby).
 */
export interface SubscriptionCardProps {
  subscription: SubscriptionDetail;
  canManage: boolean;
  pendingPlanName?: string | null;
  onResume?: () => void;
  resuming?: boolean;
  onConvertTrial?: () => void;
  convertingTrial?: boolean;
}

export function SubscriptionCard({
  subscription,
  canManage,
  pendingPlanName,
  onResume,
  resuming = false,
  onConvertTrial,
  convertingTrial = false,
}: SubscriptionCardProps) {
  const {
    planName,
    planCode,
    status,
    billingCycle,
    amount,
    currency,
    autoRenew,
    cancelAtPeriodEnd,
    trialEndsAtUtc,
    currentPeriodStartUtc,
    currentPeriodEndUtc,
    pendingChange,
  } = subscription;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {planName}
          <span className="text-muted-foreground font-mono text-xs">{planCode}</span>
          <StatusBadge status={status} />
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Current period</dt>
            <dd className="text-sm">
              {formatDate(currentPeriodStartUtc)} – {formatDate(currentPeriodEndUtc)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Price</dt>
            <dd className="text-sm">
              {formatMoney(amount, currency)} / {billingCycle}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Auto-renew</dt>
            <dd className="text-sm">{autoRenew ? 'On' : 'Off'}</dd>
          </div>
        </dl>

        {trialEndsAtUtc && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <p className="text-sm">Trial ends {formatDate(trialEndsAtUtc)}.</p>
            {canManage && onConvertTrial && (
              <Button
                variant="outline"
                size="sm"
                loading={convertingTrial}
                onClick={onConvertTrial}
              >
                Convert trial
              </Button>
            )}
          </div>
        )}

        {cancelAtPeriodEnd && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <p className="text-sm">
              Active — cancels on {formatDate(currentPeriodEndUtc)}. The gym keeps access until
              then.
            </p>
            {canManage && onResume && (
              <Button variant="outline" size="sm" loading={resuming} onClick={onResume}>
                Resume
              </Button>
            )}
          </div>
        )}

        {status === 'PastDue' && (
          <p className="text-sm">
            Payment is overdue. Service is not affected; suspending the gym is a separate action.
          </p>
        )}

        {pendingChange && (
          <p className="text-sm">
            Changes to {pendingPlanName ?? pendingChange.planId} —{' '}
            {formatMoney(pendingChange.amount, pendingChange.currency)} /{' '}
            {pendingChange.billingCycle} — on {formatDate(pendingChange.changeAtUtc)}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
