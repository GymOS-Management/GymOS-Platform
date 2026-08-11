'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { plans } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { RequirePermission } from '@/lib/auth/session';
import type { PlanDetail } from '@/types/api';

/**
 * Deactivating a plan twelve gyms are on is a materially different decision from deactivating an
 * unused one — the count comes straight from `PlanDetail`, which is `number | string` on the wire
 * (AD-12), so it is coerced once here rather than compared as a string.
 */
function deactivateDescription(subscribedGymCount: number | string): string {
  const count = Number(subscribedGymCount);

  if (!Number.isFinite(count) || count <= 0) {
    return 'No gym is currently on this plan. It stops being assignable to new gyms.';
  }

  return `${count} gym${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} currently on this plan and are unaffected — deactivating only stops it being assigned to new gyms.`;
}

/**
 * Activate / Deactivate — the plan's only lifecycle controls.
 *
 * **There is no delete control here, and there must never be one.** `DELETE /plans/{id}` answers 405
 * by deliberate backend design: a deleted plan would orphan the subscriptions that copied its price at
 * assignment time. Deactivate — "stop offering this to new gyms" — is the operation that exists for a
 * plan already in use; withdrawing a plan is not the same act as erasing it.
 *
 * Both calls carry the plan's `rowVersion` explicitly (unlike `plans.update`, which uses the
 * remembered ETag) — see endpoints.ts.
 */
export function PlanStatusActions({
  plan,
  onChanged,
}: {
  plan: PlanDetail;
  onChanged: (plan: PlanDetail) => void;
}) {
  const [dialog, setDialog] = useState<'activate' | 'deactivate' | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
  };

  const activate = async () => {
    setBusy(true);
    try {
      const updated = await plans.activate(plan.id, plan.rowVersion);
      toast.success(`${updated.name} is active.`);
      onChanged(updated);
      setDialog(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const updated = await plans.deactivate(plan.id, plan.rowVersion);
      toast.success(`${updated.name} is inactive.`);
      onChanged(updated);
      setDialog(null);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <RequirePermission permission="billing.manage">
          {plan.isActive ? (
            <Button variant="outline" onClick={() => setDialog('deactivate')}>
              Deactivate
            </Button>
          ) : (
            <Button onClick={() => setDialog('activate')}>Activate</Button>
          )}
        </RequirePermission>
      </div>

      <ConfirmDialog
        open={dialog === 'activate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Activate ${plan.name}?`}
        description="The plan becomes assignable to gyms again."
        confirmLabel="Activate"
        busy={busy}
        onConfirm={activate}
      />

      <ConfirmDialog
        open={dialog === 'deactivate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Deactivate ${plan.name}?`}
        description={deactivateDescription(plan.subscribedGymCount)}
        confirmLabel="Deactivate"
        destructive
        busy={busy}
        onConfirm={deactivate}
      />
    </>
  );
}
