'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/lib/auth/session';
import { resolveLandingRoute } from '@/lib/nav/items';

/**
 * The root is nobody's destination — it resolves one and leaves.
 *
 * <p>It used to `redirect(LANDING_ROUTE)` from the server, unconditionally, and its comment claimed
 * "the admin layout guards the landing route itself". The layout guards <em>authentication</em> and
 * nothing else, so that was not true. F3 moved the landing route to `/dashboard` and added
 * `resolveLandingRoute` precisely so a caller holding neither `analytics.read` nor `audit.read` is not
 * dropped on a screen that can only tell them they cannot see it — but only the login page was
 * changed. Anyone arriving at `/` from a bookmark or by typing the domain still landed on the
 * permission notice, where before F3 they had landed on `/gyms`. The dashboard's own comment says
 * that state is "reachable only if the landing-route fallback is bypassed by typing the URL"; the
 * app root reached it too.</p>
 *
 * <p>Client-side, because the answer depends on the caller's permissions and those live in the
 * session — a server component cannot see them. The cost is one spinner frame on a route nobody
 * looks at, which is why this is the right place to pay it rather than teaching every screen to
 * re-check.</p>
 */
export default function RootPage() {
  const router = useRouter();
  const { status, can } = useSession();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
      return;
    }

    if (status === 'authenticated') {
      router.replace(resolveLandingRoute(can));
    }
  }, [status, can, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-label="Loading" />
    </div>
  );
}
