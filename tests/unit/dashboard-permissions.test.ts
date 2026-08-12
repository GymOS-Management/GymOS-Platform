import { describe, expect, it } from 'vitest';
import {
  FALLBACK_LANDING_ROUTE,
  LANDING_ROUTE,
  NAV_ITEMS,
  isVisible,
  resolveLandingRoute,
} from '@/lib/nav/items';

/**
 * D6: the dashboard is assembled from panels with **different** permissions, and that split is a
 * decision recorded in `Analytics.md` §6 rather than an accident.
 *
 * `/dashboard/summary` and `/dashboard/health` need `analytics.read`; `/dashboard/activity` needs
 * `audit.read`. SupportAgent deliberately holds the second and not the first, because answering
 * "why is POS off for this gym?" does not require seeing what the platform earns.
 */
const holding =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);

describe('resolveLandingRoute', () => {
  it('sends an analytics reader to the dashboard', () => {
    expect(resolveLandingRoute(holding('analytics.read', 'gyms.read'))).toBe(LANDING_ROUTE);
  });

  it('sends a support agent — audit only, no analytics — to the dashboard too', () => {
    // They get a working activity feed and no revenue. Half a screen they are entitled to beats
    // being bounced off it.
    expect(resolveLandingRoute(holding('audit.read', 'gyms.read'))).toBe(LANDING_ROUTE);
  });

  it('falls back for a caller who can see no part of it', () => {
    // Landing on an empty dashboard would read as a broken screen rather than a permission boundary.
    expect(resolveLandingRoute(holding('gyms.read', 'billing.read'))).toBe(FALLBACK_LANDING_ROUTE);
  });
});

describe('navigation visibility', () => {
  const dashboard = NAV_ITEMS.find((item) => item.href === '/dashboard')!;
  const analytics = NAV_ITEMS.find((item) => item.href === '/analytics/revenue')!;

  it('shows Dashboard to anyone holding either of its panels’ permissions', () => {
    expect(isVisible(dashboard, holding('analytics.read'))).toBe(true);
    expect(isVisible(dashboard, holding('audit.read'))).toBe(true);
  });

  it('hides Dashboard from a caller holding neither', () => {
    expect(isVisible(dashboard, holding('gyms.read'))).toBe(false);
  });

  it('gates Analytics on analytics.read alone — audit.read does not open it', () => {
    // The charts are all `analytics.read`; audit access must not become analytics access by
    // convenience, which is the same boundary the backend draws.
    expect(isVisible(analytics, holding('analytics.read'))).toBe(true);
    expect(isVisible(analytics, holding('audit.read'))).toBe(false);
  });

  it('leaves the single-permission items behaving as before', () => {
    const gyms = NAV_ITEMS.find((item) => item.href === '/gyms')!;

    expect(isVisible(gyms, holding('gyms.read'))).toBe(true);
    expect(isVisible(gyms, holding('audit.read'))).toBe(false);
  });
});
