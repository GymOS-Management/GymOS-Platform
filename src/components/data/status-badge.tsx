import { Badge } from '@/components/ui/badge';

/**
 * One reading of a status string across the whole console, so "Suspended" is never amber on one
 * screen and red on another. Unknown statuses render neutrally rather than crashing — a new backend
 * state must degrade to "shown but unstyled", never to a blank page.
 */
const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  // Gyms
  Provisioning: 'info',
  Active: 'success',
  Suspended: 'warning',
  Deleted: 'danger',

  // Users
  PendingActivation: 'info',

  // Subscriptions (M3.2)
  Trialing: 'info',
  PastDue: 'warning',
  Canceled: 'neutral',
  Expired: 'neutral',

  // Invoices (M3.3/M3.4)
  Draft: 'neutral',
  Issued: 'info',
  Paid: 'success',
  Overdue: 'danger',
  Void: 'neutral',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{status}</Badge>;
}
