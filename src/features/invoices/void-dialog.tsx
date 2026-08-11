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
 * Voids an invoice — the same step-up pattern as `DestructiveConfirmDialog`
 * (`components/feedback/confirm-dialogs.tsx`): the operator types the invoice's own number and it is
 * sent as `X-Confirm-Action`, which the API compares against the invoice (AD-6). No prefill, no copy
 * affordance — a confirmation the UI filled in would confirm nothing.
 *
 * Unlike that shared dialog, this one also disables its button until the typed value matches
 * exactly. Voiding an invoice has no soft-delete recovery the way a gym does, so the extra guard
 * against an obviously-wrong value earns its keep here; the server still re-checks and is still the
 * one that can refuse (a race between typing and submitting is still possible and still handled
 * there), this is only a courtesy on top.
 */
export function VoidDialog({
  open,
  invoiceNumber,
  onConfirm,
  onClose,
}: {
  open: boolean;
  invoiceNumber: string;
  onConfirm: (typed: string) => Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setTyped('');
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(typed);
      setTyped('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void {invoiceNumber}?</DialogTitle>
          <DialogDescription>
            This cannot be undone. Type the invoice number below to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="void-confirmation">Invoice number</Label>
          <Input
            id="void-confirmation"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== invoiceNumber}
            loading={busy}
            onClick={submit}
          >
            Void invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
