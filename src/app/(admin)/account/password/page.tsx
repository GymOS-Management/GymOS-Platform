'use client';

import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/forms/form-field';
import { auth } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { useSession } from '@/lib/auth/session';
import { PageHeader } from '@/components/layout/page-header';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ChangePasswordPage() {
  const { signOut } = useSession();

  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>();

  const submit = handleSubmit(async (values) => {
    try {
      await auth.changePassword(values.currentPassword, values.newPassword);

      // The API revokes every session on a password change, the caller's included — a stolen token
      // must not survive the change. So the only honest next step is to sign in again.
      toast.success('Password changed. Sign in again with the new one.');
      await signOut();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'auth.current_password_incorrect') {
        setError('currentPassword', { type: 'server', message: error.message });
        return;
      }
      if (error instanceof ApiError && error.code === 'auth.password_too_weak') {
        setError('newPassword', { type: 'server', message: error.message });
        return;
      }
      toastApiError(error);
    }
  });

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" />
      <Card>
        <CardHeader>
          <CardTitle>New password</CardTitle>
          <CardDescription>
            Changing it signs you out everywhere, including here — you will sign in again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField id="current" label="Current password" error={errors.currentPassword}>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.currentPassword ? true : undefined}
                {...register('currentPassword', { required: 'Enter your current password.' })}
              />
            </FormField>

            <FormField
              id="new"
              label="New password"
              error={errors.newPassword}
              hint="At least 12 characters."
            >
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.newPassword ? true : undefined}
                {...register('newPassword', {
                  required: 'Choose a new password.',
                  minLength: { value: 12, message: 'At least 12 characters.' },
                })}
              />
            </FormField>

            <FormField id="confirm" label="Repeat new password" error={errors.confirmPassword}>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={errors.confirmPassword ? true : undefined}
                {...register('confirmPassword', {
                  validate: (value) =>
                    value === getValues('newPassword') || 'The passwords do not match.',
                })}
              />
            </FormField>

            <Button type="submit" loading={isSubmitting}>
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
