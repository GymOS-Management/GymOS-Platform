'use client';

import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { subscriptions } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import type { SubscriptionDetail } from '@/types/api';

/**
 * Cancels a gym's subscription. `CancelSubscriptionRequest.reason` is nullable on the wire, but this
 * dialog requires one anyway — an operator reading the cancellation later (in `HistoryList`) needs to
 * know why, same policy as the gym-suspension reason (gym-status-actions.tsx).
 *
 * The timing choice is the whole point of this dialog: **at period end** (the default — the gym stays
 * `Active` and keeps access until the period it already paid for ends) versus **immediately** (ends
 * access now). Defaulting to immediate would make the destructive choice the path of least resistance.
 */
export function CancelSubscriptionDialog({
  gymId,
  canManage,
  onCanceled,
}: {
  gymId: string;
  canManage: boolean;
  onCanceled: (subscription: SubscriptionDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [immediately, setImmediately] = useState(false);
  const [saving, setSaving] = useState(false);
  const groupName = useId();

  const submit = async () => {
    if (!reason.trim()) {
      toast.error('Give a reason for the cancellation.');
      return;
    }

    setSaving(true);
    try {
      const updated = await subscriptions.cancel(gymId, { reason: reason.trim(), immediately });
      toast.success(immediately ? 'Subscription canceled.' : 'Cancellation scheduled.');
      onCanceled(updated);
      setOpen(false);
      setReason('');
      setImmediately(false);
    } catch (error) {
      toastApiError(error);
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return null;
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cancel subscription
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setReason('');
            setImmediately(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel subscription?</DialogTitle>
            <DialogDescription>
              At period end leaves the gym Active and paid-through — it keeps access until the
              current period ends, then stops renewing. Immediately ends access now, whether or not
              the current period has been paid for in full.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">When</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={groupName}
                  checked={!immediately}
                  onChange={() => setImmediately(false)}
                />
                At period end (recommended)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={groupName}
                  checked={immediately}
                  onChange={() => setImmediately(true)}
                />
                Immediately
              </label>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason</Label>
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Requested by the gym owner, invoice 1042"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              onClick={submit}
              loading={saving}
              disabled={!reason.trim()}
            >
              {immediately ? 'Cancel immediately' : 'Schedule cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
