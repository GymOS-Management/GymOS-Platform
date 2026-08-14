'use client';

import { use, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/data/status-badge';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { ConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { FormField } from '@/components/forms/form-field';
import { PageHeader } from '@/components/layout/page-header';
import { roles as rolesApi, users } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { RequirePermission, usePermission, useSession } from '@/lib/auth/session';
import { formatDateTime, formatRelative } from '@/lib/utils/format';
import type { UserDetail } from '@/types/api';

/**
 * Reports what actually happened to an activation or reset email.
 *
 * The API answers 204 and puts the real outcome in `X-Invitation-Email`: `sent`, `failed`, or
 * `disabled`. The console used to claim "has been sent" on any 204, so with SMTP down an operator was
 * told the message went out — while the previous link had genuinely been invalidated. Being told the
 * truth matters precisely because the destructive half succeeded regardless.
 *
 * An absent or unrecognised header is treated as "cannot confirm" rather than as success: this
 * console should not invent a delivery it has no evidence for.
 */
function reportLinkOutcome(outcome: string | null, copy: { sent: string; notSent: string }): void {
  if (outcome === 'sent') {
    toast.success(copy.sent);
    return;
  }

  if (outcome === 'disabled') {
    toast.warning(
      `${copy.notSent} Email is switched off on this environment (Email:Enabled), so no message was attempted.`,
    );
    return;
  }

  // `failed`, or a header this console does not recognise.
  toast.warning(`${copy.notSent} Check the mail server, then send it again.`);
}

export default function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);

  const query = useQuery({
    queryKey: ['users', 'detail', userId],
    queryFn: ({ signal }) => users.get(userId, signal),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <PageHeader
        title="Administrator unavailable"
        description={<ApiErrorText error={query.error} />}
      />
    );
  }

  const user = query.data;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {user.firstName} {user.lastName}
            <StatusBadge status={user.status} />
          </span>
        }
        description={
          <>
            {user.email}
            {user.status === 'Suspended' && user.suspensionReason && (
              <span className="mt-1 block">Suspended: {user.suspensionReason}</span>
            )}
          </>
        }
        actions={<UserLifecycleActions user={user} />}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <NameCard user={user} />
        <RolesCard user={user} />
        <ActivityCard user={user} />
        <PermissionsCard user={user} />
      </div>
    </>
  );
}

function UserLifecycleActions({ user }: { user: UserDetail }) {
  const queryClient = useQueryClient();
  const { user: caller } = useSession();
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null);
  const [reason, setReason] = useState('');

  // The API refuses self-suspension anyway; not offering it spares the operator the error.
  const isSelf = caller?.id === user.id;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
    setDialog(null);
    setReason('');
  };

  const suspend = useMutation({
    mutationFn: () => users.suspend(user.id, reason),
    onSuccess: async () => {
      toast.success(`${user.firstName} ${user.lastName} suspended; their sessions have ended.`);
      await refresh();
    },
    onError: (error) => toastApiError(error),
  });

  const reactivate = useMutation({
    mutationFn: () => users.reactivate(user.id),
    onSuccess: async () => {
      toast.success(`${user.firstName} ${user.lastName} reactivated.`);
      await refresh();
    },
    onError: (error) => toastApiError(error),
  });

  /**
   * The two ADR-53 actions. Deliberately worded as "sent", never "delivered": the API reports that
   * the message reached the mail server, and a bounce or a spam filing is invisible from here.
   *
   * And "sent" is now claimed only when the API says so. Both endpoints answer 204 with the real
   * outcome in `X-Invitation-Email`, which this page used to discard — so a failed send read as a
   * success while the previous link had already been invalidated. See `reportLinkOutcome`.
   */
  const resendInvitation = useMutation({
    mutationFn: () => users.resendInvitation(user.id),
    onSuccess: (outcome) =>
      reportLinkOutcome(outcome, {
        sent: `A new activation link has been sent to ${user.email}. It replaces the last one.`,
        notSent: `A new activation link was created for ${user.email} and the last one no longer works — but the email did not go out.`,
      }),
    onError: (error) => toastApiError(error),
  });

  const sendPasswordReset = useMutation({
    mutationFn: () => users.sendPasswordReset(user.id),
    onSuccess: (outcome) =>
      reportLinkOutcome(outcome, {
        sent: `A password-reset link has been sent to ${user.email}.`,
        notSent: `A password-reset link was created for ${user.email}, but the email did not go out.`,
      }),
    onError: (error) => toastApiError(error),
  });

  if (isSelf) {
    return null;
  }

  const pendingActivation = user.status === 'PendingActivation';

  return (
    <RequirePermission permission="users.manage">
      <div className="flex flex-wrap gap-2">
        {/*
          Which of the two is offered follows the account's own state, because the API refuses the
          wrong one — an invitation to somebody established, or a "reset" for somebody who never had
          a password. Offering only the one that applies spares the operator the error.

          Neither is offered for a suspended account: a reset must not be a way back in, so
          reactivation comes first, deliberately.
        */}
        {pendingActivation && (
          <Button
            variant="outline"
            onClick={() => resendInvitation.mutate()}
            disabled={resendInvitation.isPending}
          >
            {resendInvitation.isPending ? 'Sending…' : 'Re-send invitation'}
          </Button>
        )}

        {user.status === 'Active' && (
          <Button
            variant="outline"
            onClick={() => sendPasswordReset.mutate()}
            disabled={sendPasswordReset.isPending}
          >
            {sendPasswordReset.isPending ? 'Sending…' : 'Send password reset'}
          </Button>
        )}

        {user.status === 'Suspended' ? (
          <Button onClick={() => setDialog('reactivate')}>Reactivate</Button>
        ) : (
          <Button variant="outline" onClick={() => setDialog('suspend')}>
            Suspend
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === 'suspend'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Suspend ${user.firstName} ${user.lastName}?`}
        description="Their sessions end immediately — not at token expiry — and they cannot sign in until reactivated."
        confirmLabel="Suspend"
        destructive
        busy={suspend.isPending}
        onConfirm={() => suspend.mutate()}
      >
        <div className="space-y-2">
          <Label htmlFor="user-suspend-reason">Reason</Label>
          <Textarea
            id="user-suspend-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reactivate'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Reactivate ${user.firstName} ${user.lastName}?`}
        description="An account that never set a password returns to Pending Activation rather than becoming signable-in."
        confirmLabel="Reactivate"
        busy={reactivate.isPending}
        onConfirm={() => reactivate.mutate()}
      />
    </RequirePermission>
  );
}

function NameCard({ user }: { user: UserDetail }) {
  const queryClient = useQueryClient();
  const canManage = usePermission('users.manage');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ firstName: string; lastName: string }>({
    defaultValues: { firstName: user.firstName, lastName: user.lastName },
  });

  const save = handleSubmit(async (values) => {
    try {
      await users.update(user.id, values);
      toast.success('Name updated.');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error) {
      toastApiError(error);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>
          Email is not editable — it is the sign-in identity and the audit key.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate className="space-y-4">
          <FormField id="detail-email" label="Email">
            <Input id="detail-email" disabled value={user.email} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="detail-first" label="First name" error={errors.firstName}>
              <Input
                id="detail-first"
                disabled={!canManage}
                {...register('firstName', { required: 'Required.' })}
              />
            </FormField>
            <FormField id="detail-last" label="Last name" error={errors.lastName}>
              <Input
                id="detail-last"
                disabled={!canManage}
                {...register('lastName', { required: 'Required.' })}
              />
            </FormField>
          </div>
          {canManage && (
            <Button type="submit" loading={isSubmitting}>
              Save name
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function RolesCard({ user }: { user: UserDetail }) {
  const queryClient = useQueryClient();
  const canManage = usePermission('users.manage');
  const { user: caller } = useSession();
  const isSelf = caller?.id === user.id;

  const roleQuery = useQuery({
    queryKey: ['roles'],
    queryFn: ({ signal }) => rolesApi.list(signal),
    enabled: canManage,
  });

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(user.roles.map((role) => role.id)),
  );

  const save = useMutation({
    // Declarative: the complete set the user should end up with, with the version read alongside it.
    mutationFn: () => users.setRoles(user.id, [...selected], user.rowVersion),
    onSuccess: async () => {
      toast.success('Roles updated. Takes effect on their next request.');
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        toast.error(error.message, {
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 10_000,
        });
        return;
      }
      toastApiError(error);
    },
  });

  // Editing your own roles is refused by the API; showing the editor to yourself invites the error.
  if (!canManage || isSelf) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1">
          {user.roles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No roles assigned.</p>
          ) : (
            user.roles.map((role) => (
              <Badge key={role.id} tone="outline">
                {role.name}
              </Badge>
            ))
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roles</CardTitle>
        <CardDescription>Send the complete set — unticking removes the role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {roleQuery.data?.map((role) => (
            <label key={role.id} className="flex min-h-11 items-start gap-2 text-sm sm:min-h-0">
              <input
                type="checkbox"
                className="accent-primary mt-0.5 h-4 w-4"
                checked={selected.has(role.id)}
                onChange={(event) => {
                  const next = new Set(selected);
                  if (event.target.checked) {
                    next.add(role.id);
                  } else {
                    next.delete(role.id);
                  }
                  setSelected(next);
                }}
              />
              <span>
                <span className="font-medium">{role.name}</span>
                {role.description && (
                  <span className="text-muted-foreground block text-xs">{role.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Save roles
        </Button>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ user }: { user: UserDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Last sign-in</dt>
            <dd className="text-sm">{formatRelative(user.lastLoginAtUtc)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Password changed</dt>
            <dd className="text-sm">{formatDateTime(user.passwordChangedAtUtc)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Created</dt>
            <dd className="text-sm">{formatDateTime(user.createdAtUtc)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function PermissionsCard({ user }: { user: UserDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Effective permissions</CardTitle>
        <CardDescription>
          Resolved from their roles — what the API will actually allow, not what was intended.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-1">
        {user.permissions.length === 0 ? (
          <p className="text-muted-foreground text-sm">None.</p>
        ) : (
          user.permissions.map((permission) => (
            <Badge key={permission} tone="neutral" className="font-mono text-[11px]">
              {permission}
            </Badge>
          ))
        )}
      </CardContent>
    </Card>
  );
}
