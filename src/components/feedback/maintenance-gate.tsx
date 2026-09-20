'use client';

import { useEffect, useState } from 'react';
import { MaintenanceNotice } from '@/components/feedback/maintenance-notice';
import { onMaintenanceSet } from '@/lib/api/client';
import type { ApiError } from '@/lib/api/problems';

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

  if (blocked) {
    return (
      <MaintenanceNotice
        message={blocked.detail ?? 'GymOS is undergoing maintenance. Please try again shortly.'}
        retryAfterSeconds={blocked.retryAfterSeconds}
      />
    );
  }

  return <>{children}</>;
}
