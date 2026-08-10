import {
  Building2,
  ClipboardList,
  CreditCard,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * The sidebar, filtered against the caller's permissions.
 *
 * **Temporary by construction.** ARCHITECTURE-EXTENSIONS §2.6 puts this tree behind
 * `GET /api/v1/navigation`, merged from module manifests and filtered server-side. That endpoint does
 * not exist yet and cannot until the `IModule` loader does, so F1 filters client-side instead
 * (F1-DESIGN.md D9).
 *
 * The shape below mirrors what `/navigation` will return, and this module is the only place that knows
 * it — switching is replacing the data source, not rewriting the shell. Page-level enforcement is the
 * API's either way: hiding a link never protects a route.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** The permission that makes this item worth showing. Absent means always visible. */
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Gyms', href: '/gyms', icon: Building2, permission: 'gyms.read' },
  { label: 'Plans', href: '/plans', icon: CreditCard, permission: 'billing.read' },
  { label: 'Invoices', href: '/invoices', icon: Receipt, permission: 'billing.read' },
  { label: 'Administrators', href: '/users', icon: Users, permission: 'users.read' },
  { label: 'Audit log', href: '/audit-logs', icon: ClipboardList, permission: 'audit.read' },
];

/**
 * Where an operator lands after signing in.
 *
 * Not a dashboard: its figures come from M5's stats jobs, and a grid of zeroes teaches operators to
 * distrust the screen (the same reasoning that kept `gym_stats` out of the M2 gym response). Gyms is
 * the screen they actually came to use.
 */
export const LANDING_ROUTE = '/gyms';
