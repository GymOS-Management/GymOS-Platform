'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { FormField, applyProblemToForm } from '@/components/forms/form-field';
import { roles, users } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';

/**
 * Invites an administrator. There is deliberately no password field anywhere in this flow: the
 * account is created in PendingActivation and only its owner ever sets a password — no administrator
 * sets another's (the backend's invite design). The form offers what the API accepts, nothing more.
 */
interface InviteForm {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
}

export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const roleQuery = useQuery({
    queryKey: ['roles'],
    queryFn: ({ signal }) => roles.list(signal),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<InviteForm>({ defaultValues: { roleIds: [] } });

  const invite = useMutation({
    mutationFn: (values: InviteForm) =>
      users.invite({
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        roleIds: values.roleIds,
      }),
    onSuccess: async (created) => {
      toast.success(
        `${created.firstName} ${created.lastName} invited. They cannot sign in until they set a password.`,
      );
      reset();
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => {
      if (!applyProblemToForm(error, setError, ['email', 'firstName', 'lastName'] as const)) {
        toastApiError(error);
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite an administrator</DialogTitle>
          <DialogDescription>
            The account is created without a password and stays inactive until its owner sets one.
          </DialogDescription>
        </DialogHeader>

        <form
          id="invite-user-form"
          onSubmit={handleSubmit((values) => invite.mutate(values))}
          noValidate
          className="space-y-4"
        >
          <FormField id="invite-email" label="Email" error={errors.email}>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              {...register('email', { required: 'Enter their email.' })}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="invite-first" label="First name" error={errors.firstName}>
              <Input
                id="invite-first"
                aria-invalid={errors.firstName ? true : undefined}
                {...register('firstName', { required: 'Enter their first name.' })}
              />
            </FormField>
            <FormField id="invite-last" label="Last name" error={errors.lastName}>
              <Input
                id="invite-last"
                aria-invalid={errors.lastName ? true : undefined}
                {...register('lastName', { required: 'Enter their last name.' })}
              />
            </FormField>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Roles</legend>
            {roleQuery.isPending && <p className="text-muted-foreground text-sm">Loading roles…</p>}
            {roleQuery.data?.map((role) => (
              <label key={role.id} className="flex min-h-11 items-start gap-2 text-sm sm:min-h-0">
                <input
                  type="checkbox"
                  value={role.id}
                  className="accent-primary mt-0.5 h-4 w-4"
                  {...register('roleIds')}
                />
                <span>
                  <span className="font-medium">{role.name}</span>
                  {role.description && (
                    <span className="text-muted-foreground block text-xs">{role.description}</span>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="invite-user-form" loading={invite.isPending}>
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
