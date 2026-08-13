'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ConfirmDialog, DestructiveConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { gyms } from '@/lib/api/endpoints';
import { apiErrorMessage, toastApiError } from '@/lib/feedback/toast-api-error';
import { RequirePermission } from '@/lib/auth/session';
import type { GymDetail } from '@/types/api';

/**
 * The lifecycle controls on a gym's header. Which appear is decided twice, on purpose:
 * by the gym's status (only legal transitions are offered — the domain's transition table, read as UI)
 * and by the caller's permissions (suspend and delete are different authorities; PlatformAdmin holds
 * the first, not the second). The API re-checks both regardless.
 */
export function GymStatusActions({ gym }: { gym: GymDetail }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | 'activate' | 'delete' | null>(
    null,
  );
  const [reason, setReason] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['gyms'] });
    setDialog(null);
    setReason('');
  };

  const fail = (error: unknown) => {
    toastApiError(error);
  };

  const activate = useMutation({
    mutationFn: () => gyms.activate(gym.id),
    onSuccess: async () => {
      toast.success(`${gym.name} is now live.`);
      await refresh();
    },
    onError: fail,
  });

  const suspend = useMutation({
    mutationFn: () => gyms.suspend(gym.id, reason),
    onSuccess: async () => {
      toast.success(`${gym.name} suspended.`);
      await refresh();
    },
    onError: fail,
  });

  const reactivate = useMutation({
    mutationFn: () => gyms.reactivate(gym.id),
    onSuccess: async () => {
      toast.success(`${gym.name} reactivated.`);
      await refresh();
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: (typed: string) => gyms.remove(gym.id, typed),
    onSuccess: async () => {
      toast.success(`${gym.name} deleted.`);
      await queryClient.invalidateQueries({ queryKey: ['gyms'] });
      // The gym still resolves on GET (soft delete), but the operator's task here is finished.
      router.push('/gyms');
    },
    onError: (error) => {
      // A wrong confirmation stays *in the dialog*, next to the field the operator must fix.
      // Closing and toasting would make them reopen and retype everything.
      setDeleteError(apiErrorMessage(error));
    },
  });

  if (gym.status === 'Deleted') {
    return null; // Terminal. Nothing can be offered, so nothing is.
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {gym.status === 'Provisioning' && (
          <RequirePermission permission="gyms.update">
            <Button onClick={() => setDialog('activate')}>Activate</Button>
          </RequirePermission>
        )}

        {gym.status === 'Suspended' && (
          <RequirePermission permission="gyms.suspend">
            <Button onClick={() => setDialog('reactivate')}>Reactivate</Button>
          </RequirePermission>
        )}

        {(gym.status === 'Active' || gym.status === 'Provisioning') && (
          <RequirePermission permission="gyms.suspend">
            <Button variant="outline" onClick={() => setDialog('suspend')}>
              Suspend
            </Button>
          </RequirePermission>
        )}

        <RequirePermission permission="gyms.delete">
          <Button variant="destructive" onClick={() => setDialog('delete')}>
            Delete
          </Button>
        </RequirePermission>
      </div>

      <ConfirmDialog
        open={dialog === 'activate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Open ${gym.name} for business?`}
        description="Members will be able to reach this gym once it is active."
        confirmLabel="Activate"
        busy={activate.isPending}
        onConfirm={() => activate.mutate()}
      />

      <ConfirmDialog
        open={dialog === 'suspend'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Suspend ${gym.name}?`}
        description="The gym stops operating until it is reactivated. The reason is recorded and shown to whoever lifts the suspension."
        confirmLabel="Suspend"
        destructive
        busy={suspend.isPending}
        onConfirm={() => suspend.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Non-payment, invoice 1042"
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reactivate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Reactivate ${gym.name}?`}
        description={
          gym.suspensionReason
            ? `Suspended for: “${gym.suspensionReason}”. Reactivating clears this and the gym resumes operating.`
            : 'The gym resumes operating immediately.'
        }
        confirmLabel="Reactivate"
        busy={reactivate.isPending}
        onConfirm={() => reactivate.mutate()}
      />

      <DestructiveConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setDeleteError(null);
          }
        }}
        title={`Delete ${gym.name}?`}
        description="This removes the entire business's access and cannot be undone. Records stay readable for the retention period; the gym's address is never reused."
        expectedHint={`Type the gym's address (${gym.slug}) to confirm`}
        confirmLabel="Delete gym"
        busy={remove.isPending}
        errorMessage={deleteError}
        onConfirm={(typed) => remove.mutate(typed)}
      />
    </>
  );
}
