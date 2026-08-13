'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Dumbbell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FormField } from '@/components/forms/form-field';
import { auth } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';

interface SetPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

/**
 * Where an invitation or password-reset link lands.
 *
 * Outside the authenticated shell, beside `/login`: the person following the link cannot sign in —
 * that is the situation it exists to resolve — so the one-time token in the URL is their credential
 * (ADR-53).
 */
export default function SetPasswordPage() {
  return (
    <main className="bg-muted/30 flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Dumbbell className="text-primary h-8 w-8" aria-hidden />
          <CardTitle>Set your password</CardTitle>
        </CardHeader>
        <CardContent>
          {/* `useSearchParams` needs a Suspense boundary in the app router; without it the whole
              route opts out of static rendering with a build-time warning. */}
          <Suspense fallback={<Skeleton className="h-40" />}>
            <SetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  /**
   * The link is checked before the form is offered.
   *
   * Showing a form that fails on submit wastes the one thing the person came to do, and — since a
   * rejected password still spends the link — would be actively misleading. `unusable` covers
   * every reason at once, because the API deliberately answers all of them identically.
   */
  const [checked, setChecked] = useState<'usable' | 'unusable' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A missing token is derived, not stored: there is nothing to ask the API about, so it needs no
  // effect and no state — and setting state in an effect body to reach the same conclusion is the
  // cascading render React tells you not to write.
  const status = token === '' ? 'unusable' : (checked ?? 'checking');

  useEffect(() => {
    if (token === '') {
      return;
    }

    const controller = new AbortController();

    auth
      .checkActivationLink(token, controller.signal)
      .then(() => setChecked('usable'))
      .catch((error: unknown) => {
        // An aborted check is a re-render, not a dead link. And a network failure is not evidence
        // the link is dead either — only the API's own refusal is, so anything else lets the form
        // through and leaves the verdict to the submit.
        if (!controller.signal.aborted) {
          setChecked(error instanceof ApiError ? 'unusable' : 'usable');
        }
      });

    return () => controller.abort();
  }, [token]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordForm>();

  const submit = handleSubmit(async (values) => {
    setFailure(null);

    try {
      await auth.setPassword(token, values.newPassword);

      // Straight to sign-in rather than signing them in here: setting a password revokes every
      // session by design, so there is nothing to carry forward, and arriving at the login screen
      // with a password they just chose is the least surprising next step.
      //
      // The toast carries the confirmation across the navigation — the Toaster lives in the root
      // layout, so it outlives this page. Cheaper than teaching /login to read a query parameter,
      // which in the app router would mean its own Suspense boundary.
      toast.success('Your password is set. Sign in with it to continue.');
      router.replace('/login');
    } catch (error) {
      // A rejected password has still spent the link, so the message has to say so — otherwise the
      // person tries again against a link that can no longer work.
      //
      // The fallback keeps "Please try again." (toast-api-error.ts's default is the shorter generic
      // sentence): retrying is the one useful thing to suggest when setting a password fails.
      const message = apiErrorMessage(error, 'Something went wrong. Please try again.');

      setFailure(
        error instanceof ApiError
          ? `${message} This link has now been used — ask an administrator for a new one.`
          : message,
      );
    }
  });

  if (status === 'checking') {
    return <Skeleton className="h-40" aria-busy="true" />;
  }

  if (status === 'unusable') {
    return (
      <div className="space-y-4 text-sm">
        <p role="alert" className="text-muted-foreground">
          This link is no longer usable. Invitation links expire, and each one works only once.
        </p>
        <p className="text-muted-foreground">
          Ask whoever invited you to send another, then follow the newest link.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {failure && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {failure}
        </p>
      )}

      <FormField
        id="newPassword"
        label="New password"
        error={errors.newPassword}
        hint="At least 12 characters."
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          autoFocus
          {...register('newPassword', {
            required: 'Choose a password.',
            // Mirrors the server's policy so the common mistake is caught before the link is spent.
            // The server remains the authority: it re-checks, and its refusal is shown above.
            minLength: { value: 12, message: 'Use at least 12 characters.' },
          })}
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm password" error={errors.confirmPassword}>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword', {
            required: 'Type the password again.',
            // Worth more here than on an ordinary form: a typo would set a password nobody knows,
            // and the link that would let them try again is already spent.
            // `getValues`, not `watch`: this reads the other field once, at validation time,
            // rather than subscribing to it — which is also what keeps the component memoizable.
            validate: (value) =>
              value === getValues('newPassword') || 'The passwords do not match.',
          })}
        />
      </FormField>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Setting password…' : 'Set password'}
      </Button>
    </form>
  );
}
