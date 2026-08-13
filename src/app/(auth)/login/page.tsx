'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dumbbell } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/forms/form-field';
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';
import { useSession } from '@/lib/auth/session';
import { resolveLandingRoute } from '@/lib/nav/items';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { status, signIn, can } = useSession();
  const [failure, setFailure] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  // Already signed in (or the refresh cookie restored a session while this page rendered):
  // there is nothing to do here.
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(resolveLandingRoute(can));
    }
  }, [status, router, can]);

  const submit = handleSubmit(async (values) => {
    setFailure(null);

    try {
      await signIn(values.email, values.password);
      // Redirecting is left to the effect above rather than done here. Where the operator lands now
      // depends on their permissions (D6), and `can` in this closure still answers for the
      // anonymous render that opened the form — it would send an analytics reader to the fallback.
      // The effect re-runs with the loaded session and resolves it correctly.
    } catch (error) {
      // Deliberately one banner, not a field error: the API's `auth.invalid_credentials` covers
      // unknown email, wrong password, and un-activated invitation precisely so sign-in is not an
      // account-existence oracle — and the UI must not un-blur that by pointing at a field.
      setFailure(apiErrorMessage(error));
    }
  });

  return (
    <main className="bg-muted/30 flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Dumbbell className="text-primary h-8 w-8" aria-hidden />
          <CardTitle>GymOS Super Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {failure && (
              <p
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
              >
                {failure}
              </p>
            )}

            <FormField id="email" label="Email" error={errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                aria-invalid={errors.email ? true : undefined}
                {...register('email', { required: 'Enter your email.' })}
              />
            </FormField>

            <FormField id="password" label="Password" error={errors.password}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? true : undefined}
                {...register('password', { required: 'Enter your password.' })}
              />
            </FormField>

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
