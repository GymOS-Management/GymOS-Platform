import {
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Receipt,
  ToggleLeft,
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
  /**
   * Shown when the caller holds **any** of these. For an item whose screen is assembled from panels
   * with different permissions — the dashboard is one — a single `permission` would either hide it
   * from someone entitled to part of it or show it to someone entitled to none.
   */
  anyPermission?: string[];
}

/** Whether an item is worth showing to a caller with this permission check. */
export function isVisible(item: NavItem, can: (permission: string) => boolean): boolean {
  if (item.anyPermission) {
    return item.anyPermission.some(can);
  }

  return item.permission === undefined || can(item.permission);
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    // Two panels, two permissions: the summary and health need `analytics.read`, the activity feed
    // needs `audit.read`, and SupportAgent deliberately holds the second and not the first.
    anyPermission: ['analytics.read', 'audit.read'],
  },
  { label: 'Gyms', href: '/gyms', icon: Building2, permission: 'gyms.read' },
  {
    label: 'Analytics',
    href: '/analytics/revenue',
    icon: ChartNoAxesCombined,
    permission: 'analytics.read',
  },
  { label: 'Plans', href: '/plans', icon: CreditCard, permission: 'billing.read' },
  { label: 'Invoices', href: '/invoices', icon: Receipt, permission: 'billing.read' },
  { label: 'Features', href: '/features', icon: ToggleLeft, permission: 'features.read' },
  { label: 'Administrators', href: '/users', icon: Users, permission: 'users.read' },
  { label: 'Audit log', href: '/audit-logs', icon: ClipboardList, permission: 'audit.read' },
];

/**
 * Where an operator lands after signing in.
 *
 * **F3 (M5) discharged the deferral this used to record.** The comment here read:
 *
 * > Not a dashboard: its figures come from M5's stats jobs, and a grid of zeroes teaches operators
 * > to distrust the screen.
 *
 * Those jobs now exist and the figures are real, so the dashboard is the landing screen — for the
 * callers who can see any of it. A role holding neither `analytics.read` nor `audit.read` would land
 * on an empty page, so it falls back to the screen it did before.
 */
export const LANDING_ROUTE = '/dashboard';

/** Where a caller who can see no part of the dashboard goes instead. */
export const FALLBACK_LANDING_ROUTE = '/gyms';

export function resolveLandingRoute(can: (permission: string) => boolean): string {
  return can('analytics.read') || can('audit.read') ? LANDING_ROUTE : FALLBACK_LANDING_ROUTE;
}
