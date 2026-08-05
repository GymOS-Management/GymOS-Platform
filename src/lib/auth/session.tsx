'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { bootstrapSession, onSessionLostSet, setAccessToken } from '@/lib/api/client';
import { auth } from '@/lib/api/endpoints';
import type { CurrentUser } from '@/types/api';

/**
 * Who is signed in, and what they may see.
 *
 * `permissions` gates **UI only** (AD-5): hiding a button is a courtesy to the operator, never a
 * security boundary. The API re-checks every request and refuses it regardless of what the console
 * chose to render, which is why a permission list in the browser is safe to hold.
 */
interface SessionState {
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'anonymous';
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string) => boolean;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<SessionState['status']>('loading');

  const loadUser = useCallback(async () => {
    const profile = await auth.me();
    setUser(profile);
    setStatus('authenticated');
  }, []);

  /**
   * On mount, trade the refresh cookie for a token (D3). The access token lives in memory, so a full
   * page reload always starts here — and this is the only reason the console survives F5 at all.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await bootstrapSession();

      if (cancelled) {
        return;
      }

      if (!token) {
        setStatus('anonymous');
        return;
      }

      try {
        await loadUser();
      } catch {
        if (!cancelled) {
          setStatus('anonymous');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadUser]);

  /**
   * When the client gives up on a session — a refresh that failed, so the account was suspended, the
   * password changed, or the refresh chain was revoked — drop to anonymous and let the guard redirect.
   */
  useEffect(() => {
    onSessionLostSet(() => {
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
    });

    return () => onSessionLostSet(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { accessToken } = await auth.signIn(email, password);
      setAccessToken(accessToken);
      await loadUser();
    },
    [loadUser],
  );

  const signOut = useCallback(async () => {
    await auth.signOut();
    setUser(null);
    setStatus('anonymous');
    router.replace('/login');
  }, [router]);

  const value = useMemo<SessionState>(
    () => ({
      user,
      status,
      signIn,
      signOut,
      refreshUser: loadUser,
      can: (permission: string) => user?.permissions?.includes(permission) ?? false,
    }),
    [user, status, signIn, signOut, loadUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used inside <SessionProvider>.');
  }

  return context;
}

/**
 * Whether the caller holds a permission. Hides UI; does not authorize (AD-5).
 *
 * Named to read as a question at the call site: `usePermission('gyms.delete')`.
 */
export function usePermission(permission: string): boolean {
  return useSession().can(permission);
}

/**
 * Renders `children` only when the caller holds the permission.
 *
 * Deliberately renders nothing rather than a "no access" message: an operator who cannot suspend gyms
 * does not need to be told about suspension on every page. Page-level absence is handled by the nav.
 */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return usePermission(permission) ? <>{children}</> : <>{fallback}</>;
}
