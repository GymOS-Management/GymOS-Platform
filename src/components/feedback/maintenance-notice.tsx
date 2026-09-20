import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a refused caller sees (F5-DESIGN D7): the maintenance message and the retry time the API
 * sent, full-page — the whole console is closed to them, so no screen underneath is worth showing.
 */
export function MaintenanceNotice({
  message,
  retryAfterSeconds,
  onSignOut,
}: {
  message: string;
  retryAfterSeconds: number | null;
  onSignOut: () => void;
}) {
  const minutes =
    retryAfterSeconds === null ? null : Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div role="alert" className="max-w-md space-y-4 text-center">
        <Construction className="text-muted-foreground mx-auto size-10" aria-hidden />
        <h1 className="text-xl font-semibold">Maintenance in progress</h1>
        <p>{message}</p>
        {minutes !== null && (
          <p className="text-muted-foreground text-sm">
            Try again in about {minutes} {minutes === 1 ? 'minute' : 'minutes'}.
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Signed in as someone who is refused during maintenance? Sign out to sign in as another
          administrator.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button variant="primary" onClick={onSignOut}>
            Sign out
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
