'use client';

import { useQuery } from '@tanstack/react-query';
import { Construction } from 'lucide-react';
import Link from 'next/link';
import { maintenanceState } from '@/features/settings/maintenance-section';
import { settings } from '@/lib/api/endpoints';
import { usePermission } from '@/lib/auth/session';

/**
 * The first of the banner's two feeds (F5-DESIGN D7): holders of `settings.read` poll the Maintenance
 * category once a minute and keep working under a banner if they pass the middleware. A caller who
 * holds `settings.read` but not `settings.manage` does not pass — their very next request, this poll
 * included, is 503 and the client's interception takes over (the second feed). So in practice the
 * banner is the SuperAdmin's reminder that everyone else is locked out.
 */
export function MaintenanceBanner() {
  const canRead = usePermission('settings.read');
  const query = useQuery({
    queryKey: ['settings', 'Maintenance'],
    queryFn: ({ signal }) => settings.list('Maintenance', signal),
    enabled: canRead,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!query.data) {
    return null;
  }

  const state = maintenanceState(query.data);

  if (!state.enabled) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 border-b bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <Construction className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">Maintenance mode is on.</span>
      <span>Everyone else is being refused with: “{state.message}”</span>
      <Link href="/settings" className="underline underline-offset-2">
        Settings
      </Link>
    </div>
  );
}
