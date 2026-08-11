'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Records an invoice as paid. The payment reference is optional — offered because "which payment
 * settled this?" is the first question a billing dispute asks, never required because not every
 * settlement has a reference yet at the moment an operator records it.
 *
 * This dialog only collects the reference and calls `onConfirm`; it does not mint the idempotency key
 * or call the API itself. That happens one level up, in the page's submit handler, because the key
 * belongs to the operator's intent (one per press of this dialog's button) rather than to this
 * component's lifetime — see `newIdempotencyKey` (`lib/billing/idempotency.ts`).
 */
export function MarkPaidDialog({
  open,
  onConfirm,
  onClose,
}: {
  open: boolean;
  onConfirm: (paymentReference: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReference('');
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reference.trim() || null);
      setReference('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark invoice paid?</DialogTitle>
          <DialogDescription>
            Records this invoice as settled. The payment reference is optional but helps if this
            payment is disputed later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="mark-paid-reference">Payment reference</Label>
          <Input
            id="mark-paid-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="BANK-77"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
