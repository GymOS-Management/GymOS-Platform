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
 * Plain confirmation — for reversible actions (suspend, reactivate) where "are you sure" is enough.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  /** Extra fields, e.g. the suspension-reason textarea. */
  children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Type-to-confirm, mirroring the API's own step-up (AD-6): the operator types the resource's slug and
 * *what they typed* is sent as `X-Confirm-Action` — the API judges whether it matches.
 *
 * Two deliberate absences:
 * - **No prefill, no copy affordance.** A confirmation the UI fills in confirms nothing; the whole
 *   point is that a mis-clicked row cannot pass it.
 * - **No client-side match check.** The button enables when *something* is typed, and a wrong value is
 *   sent and refused by the API (`gyms.confirmation_mismatch`). Checking locally would duplicate the
 *   rule and hide from the operator that the server is the one refusing.
 */
export function DestructiveConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedHint,
  confirmLabel,
  busy = false,
  errorMessage,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Shown as the label — "Type the gym's address (acme-gym) to confirm" is stated once, here. */
  expectedHint: string;
  confirmLabel: string;
  busy?: boolean;
  errorMessage?: string | null;
  onConfirm: (typed: string) => void;
  /** Extra fields rendered above the typed-confirmation field — e.g. maintenance's message textarea.
   *  This dialog is a Radix modal: anything outside it is inert while open, so a field the operator
   *  must fill in has to live in here, not beside the dialog in the calling card. */
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState('');

  const close = (next: boolean) => {
    if (!next) {
      setTyped('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <div className="space-y-2">
          <Label htmlFor="destructive-confirmation">{expectedHint}</Label>
          <Input
            id="destructive-confirmation"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={errorMessage ? true : undefined}
          />
          {errorMessage && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim().length === 0}
            loading={busy}
            onClick={() => onConfirm(typed.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
