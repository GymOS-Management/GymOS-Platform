'use client';

import { useEffect, useState } from 'react';
import { MaintenanceNotice } from '@/components/feedback/maintenance-notice';
import { onMaintenanceSet } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/problems';
import { auth } from '@/lib/api/endpoints';

/**
 * The second of the banner's two feeds (F5-DESIGN D7). The client hands every 503
 * `settings.maintenance` here; the first one replaces the app with the notice until the page is
 * reloaded. Registered once at the app root — the same shape as the lost-session handler.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState<ApiError | null>(null);

  useEffect(() => {
    onMaintenanceSet((error) => setBlocked((current) => current ?? error));
    return () => onMaintenanceSet(null);
  }, []);

  /**
   * A full navigation rather than the router: `blocked` above and every TanStack Query cache entry
   * (including the profile the app root reads to decide whether it's signed in at all) need to be
   * gone before the login form renders, or the freshly-cleared session would still be sitting behind
   * a gate reading its own now-stale state. A new document throws all of that away for free; a
   * client-side route change would leave us re-deriving which parts of it are safe to keep. The
   * destination is built absolute, same-origin, purely to satisfy `@next/next/no-location-assign-
   * relative-destination` — a relative `/login` navigates identically.
   */
  function signOutOfMaintenance(): void {
    auth
      .signOut()
      .finally(() => {
        window.location.assign(window.location.origin + '/login');
      })
      .catch(() => {
        // `auth.signOut()` already cleared the token and ETags in its own `finally` — the request
        // failing (maintenance refusing it too, say) leaves nothing further to react to here.
      });
  }

  if (blocked) {
    return (
      <MaintenanceNotice
        message={blocked.detail ?? 'GymOS is undergoing maintenance. Please try again shortly.'}
        retryAfterSeconds={blocked.retryAfterSeconds}
        onSignOut={signOutOfMaintenance}
      />
    );
  }

  return <>{children}</>;
}
