'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { useSession } from '@/lib/auth/session';

/**
 * The authenticated boundary. Everything under (admin) renders only with a session; anonymous
 * visitors are sent to /login.
 *
 * The `loading` state is real, not cosmetic: on a full page reload the access token is gone (it lives
 * in memory, D3) and the session provider is trading the refresh cookie for a new one. Redirecting to
 * /login during that window would bounce every signed-in operator through the login page on every F5.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
