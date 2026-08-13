'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { AssignPlanDialog } from '@/features/subscriptions/assign-dialog';
import { CancelSubscriptionDialog } from '@/features/subscriptions/cancel-dialog';
import { subscriptions } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import type { SubscriptionDetail } from '@/types/api';

/**
 * The subscription tab's commitment-requiring or blunt actions: change plan, cancel, and the manual
 * `PastDue` toggle. `canManage` is the caller's `usePermission('subscriptions.manage')` (task brief
 * D-note 4: a different authority from `billing.manage`, which governs plans and prices) — passed down
 * rather than re-derived here, the same self-gating style `AssignPlanDialog`/`CancelSubscriptionDialog`
 * already use, so there is exactly one place per action that decides whether it renders.
 *
 * Resume and Convert-trial live on `SubscriptionCard` instead, next to the fact each one undoes or
 * advances; nothing here duplicates them.
 */
export function SubscriptionActions({
  gymId,
  subscription,
  canManage,
  onChanged,
}: {
  gymId: string;
  subscription: SubscriptionDetail;
  canManage: boolean;
  onChanged: (subscription: SubscriptionDetail) => void;
}) {
  const [pastDueDialog, setPastDueDialog] = useState<'mark' | 'clear' | null>(null);

  const fail = (error: unknown) => {
    toastApiError(error);
  };

  const setPaymentState = useMutation({
    mutationFn: (pastDue: boolean) => subscriptions.setPaymentState(gymId, pastDue),
    onSuccess: (updated) => {
      toast.success(updated.status === 'PastDue' ? 'Marked past due.' : 'Past-due cleared.');
      onChanged(updated);
      setPastDueDialog(null);
    },
    onError: fail,
  });

  const canCancel = subscription.status !== 'Canceled' && subscription.status !== 'Expired';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <AssignPlanDialog
          gymId={gymId}
          subscription={subscription}
          canManage={canManage}
          onAssigned={onChanged}
        />

        {canManage && canCancel && !subscription.cancelAtPeriodEnd && (
          <CancelSubscriptionDialog gymId={gymId} canManage={canManage} onCanceled={onChanged} />
        )}

        {canManage && subscription.status === 'Active' && (
          <Button variant="outline" onClick={() => setPastDueDialog('mark')}>
            Mark past due
          </Button>
        )}

        {canManage && subscription.status === 'PastDue' && (
          <Button variant="outline" onClick={() => setPastDueDialog('clear')}>
            Clear past due
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={pastDueDialog === 'mark'}
        onOpenChange={(open) => !open && setPastDueDialog(null)}
        title="Mark this subscription past due?"
        description="A manual override for support cases — the same state a failed automatic payment sets. Service is not affected; suspending the gym is a separate action."
        confirmLabel="Mark past due"
        busy={setPaymentState.isPending}
        onConfirm={() => setPaymentState.mutate(true)}
      />

      <ConfirmDialog
        open={pastDueDialog === 'clear'}
        onOpenChange={(open) => !open && setPastDueDialog(null)}
        title="Clear the past-due state?"
        description="Returns the subscription to Active. Use this once the payment has actually been collected."
        confirmLabel="Clear past due"
        busy={setPaymentState.isPending}
        onConfirm={() => setPaymentState.mutate(false)}
      />
    </>
  );
}
