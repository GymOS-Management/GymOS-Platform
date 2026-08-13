# F3 — Dashboard & Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Super Admin console a dashboard landing page and an analytics page, consuming M5's six operations.

**Architecture:** The dashboard reads **live** (`/dashboard/*` is computed per request); the analytics page reads **only** the daily read model (`/analytics/*`), which a nightly job writes once per day. The two will legitimately disagree, and the UI says so rather than hiding it. A pure helper expands the recorded days across the requested range, inserting `null` for days the backend never recorded, so a gap **breaks** the chart line instead of being silently interpolated.

**Tech Stack:** Next.js (App Router, client components), TanStack Query, Recharts, Tailwind + shadcn-style primitives, vitest + Testing Library, Playwright.

**Design:** `docs/F3-DESIGN.md` (approved 2026-08-12). Decisions are cited as D1–D10 throughout; when this plan and the design disagree, the design wins and the plan is wrong.

## Global Constraints

- **Generated types only.** DTOs come from `pnpm gen:api`; a hand-written interface mirroring a DTO is the drift generated types exist to prevent (F1 D2). If a shape is missing, regenerate — never add it by hand.
- **Permissions hide UI, never authorize** (AD-5). The API refuses a forced URL regardless.
- **Nothing polls** (D8 / F2 D8). Queries refetch on focus.
- **`connectNulls` stays off** on every chart line (D3). Turning it on is the silent lie this increment exists to refuse.
- **Currencies are never summed or stacked** (D4).
- **No new runtime dependency** beyond Recharts (D6), which changes `docs/DEPENDENCY_POLICY.md` **in the same commit** as the check that enforces it — the policy's own rule.
- **No date library.** `Intl` and UTC arithmetic suffice (dependency policy rule 3).
- Every task ends green: `pnpm typecheck && pnpm lint && pnpm test`.
- Baseline before this plan: **`pnpm test`** passes; record the count in Task 1 and treat any later drop as a regression.

## File Structure

```
src/types/api.ts                                   + 8 aliases over the generated M5 schemas
src/lib/api/endpoints.ts                           + dashboard{} and analytics{} groups (6 operations)
src/lib/api/problems.ts                            + analytics.range_invalid → the range field
src/lib/analytics/series.ts                        expandDailySeries + rangeError — pure, no React
src/lib/nav/items.ts                               + Dashboard/Analytics entries; landingRouteFor()
src/lib/feedback/toast-api-error.ts                the extraction F2's review judged earned
src/components/feedback/api-error-text.tsx         its JSX counterpart
src/components/data/chart-card.tsx                 title + chart slot + empty/loading (ARCHITECTURE §5)
src/features/dashboard/{stat-tiles,health-panel,activity-feed}.tsx
src/features/analytics/{range-picker,revenue-chart,growth-chart,churn-chart}.tsx
src/app/page.tsx                                   landing resolves per permission (D1)
src/app/(admin)/dashboard/page.tsx
src/app/(admin)/analytics/page.tsx
```

**Ordering note that matters:** the landing resolver and the Dashboard nav entry land **in the same task as the dashboard page** (Task 5), and the Analytics nav entry with the analytics page (Task 6). Adding a nav link or a redirect target before its page exists leaves the app in a state where a SuperAdmin's root URL 404s — a broken intermediate commit for no benefit.

---

### Task 1: The generated types

**Files:**

- Regenerate: `src/types/api.d.ts` (by command, never by hand)
- Modify: `src/types/api.ts`

**Interfaces:**

- Produces: `DashboardSummary`, `DashboardHealth`, `HealthCheckStatus`, `ActivityEntry`, `MoneyDto`, `RevenuePoint`, `GrowthPoint`, `ChurnPoint` — exported from `@/types/api`.

- [ ] **Step 1: Record the baseline**

```
pnpm test
```

Write the passing count down. Every later task must match or exceed it.

- [ ] **Step 2: Regenerate the contract types**

```
pnpm gen:api
git diff --stat src/types/api.d.ts
```

Expected: `api.d.ts` gains M5's six paths and eight schemas. The backend contract at `../GymOS-Backend/contracts/openapi-v1.json` is already on `main` with M5 merged, so this needs no backend work.

- [ ] **Step 3: Add the aliases**

In `src/types/api.ts`, after the audit-log block, add:

```ts
export type MoneyDto = Schemas['MoneyDto'];
export type DashboardSummary = Schemas['DashboardSummary'];
export type DashboardHealth = Schemas['DashboardHealth'];
export type HealthCheckStatus = Schemas['HealthCheckStatus'];
export type ActivityEntry = Schemas['ActivityEntry'];
export type RevenuePoint = Schemas['RevenuePoint'];
export type GrowthPoint = Schemas['GrowthPoint'];
export type ChurnPoint = Schemas['ChurnPoint'];
```

- [ ] **Step 4: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean, and the same test count as Step 1.

```bash
git add src/types
git commit -m "chore(api): regenerate types for M5's dashboard and analytics operations"
```

---

### Task 2: `toastApiError` — the extraction F2's review judged earned

F2's whole-branch review: _"`error instanceof ApiError ? error.message : 'Something went wrong.'` is copied verbatim six times, and the bare ternary appears 26 times across 17 files. One helper plus a small `ApiErrorText` component removes all of it without inventing an abstraction. This is the one extraction the review judged clearly earned."_ F3 adds error paths of its own, so it either uses a helper or becomes copy 27.

**Files:**

- Create: `src/lib/feedback/toast-api-error.ts`, `src/components/feedback/api-error-text.tsx`
- Modify: every file currently carrying the ternary (find them in Step 2 — do not trust this plan's count)
- Test: `tests/unit/toast-api-error.test.tsx`

**Interfaces:**

- Produces:
  - `apiErrorMessage(error: unknown): string` — the message, or `'Something went wrong.'`
  - `toastApiError(error: unknown, title?: string): void` — calls `sonner`'s `toast.error`
  - `<ApiErrorText error={unknown} />` — renders the same message as text

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toast-api-error.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { ApiError } from '@/lib/api/problems';

describe('apiErrorMessage', () => {
  it('uses the API problem message when there is one', () => {
    const error = new ApiError(409, { code: 'gyms.slug_taken' } as never, 'That address is taken.');
    expect(apiErrorMessage(error)).toBe('That address is taken.');
  });

  it('falls back for anything that is not an ApiError', () => {
    // A network failure, a thrown string, an undefined - all reach the same place, and the
    // operator must never be shown "undefined" or a stack trace.
    expect(apiErrorMessage(new TypeError('fetch failed'))).toBe('Something went wrong.');
    expect(apiErrorMessage(undefined)).toBe('Something went wrong.');
  });

  it('renders the same message as text', () => {
    render(<ApiErrorText error={new TypeError('boom')} />);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });
});
```

**Before writing it,** read `src/lib/api/problems.ts` for `ApiError`'s real constructor signature and adjust the first case to match — the shape above is the plan's guess, and the file is the truth.

- [ ] **Step 2: Run it, and find every call site**

```
pnpm test tests/unit/toast-api-error.test.tsx
```

Expected: FAIL — the module does not exist.

```
grep -rn "instanceof ApiError" src/ | wc -l
grep -rln "instanceof ApiError" src/
```

Write both numbers into your report. They are the scope of Step 4.

- [ ] **Step 3: Write the helper and the component**

```ts
// src/lib/feedback/toast-api-error.ts
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/problems';

/** What went wrong, in a sentence an operator can act on. */
export const FALLBACK_MESSAGE = 'Something went wrong.';

/**
 * The API writes `detail` for humans and `problems.ts` maps known codes, so an `ApiError`'s message is
 * already the right sentence. Everything else — a network failure, a bug, a thrown string — is not
 * something to show a person, so it degrades to one fallback rather than leaking an internal message.
 */
export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : FALLBACK_MESSAGE;
}

export function toastApiError(error: unknown, title?: string): void {
  if (title) {
    toast.error(title, { description: apiErrorMessage(error) });
    return;
  }

  toast.error(apiErrorMessage(error));
}
```

```tsx
// src/components/feedback/api-error-text.tsx
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';

/** The same sentence as `toastApiError`, rendered inline instead of in a toast. */
export function ApiErrorText({ error, className }: { error: unknown; className?: string }) {
  return <p className={className}>{apiErrorMessage(error)}</p>;
}
```

- [ ] **Step 4: Migrate every call site**

Replace each occurrence with `toastApiError(...)` or `<ApiErrorText />`. **Do not change any message text** — where a site passes a different fallback string than `'Something went wrong.'`, keep that site's wording by leaving it alone and note it in your report rather than silently harmonising copy. A refactor that quietly rewords user-facing text is not a refactor.

- [ ] **Step 5: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test
```

Expected: clean; the count is the baseline plus 3.

```bash
git add src tests
git commit -m "refactor(feedback): one apiErrorMessage, not twenty-six ternaries"
```

---

### Task 3: The six endpoint functions

**Files:**

- Modify: `src/lib/api/endpoints.ts`
- Test: `tests/unit/endpoints.test.ts`

**Interfaces:**

- Consumes: Task 1's type aliases; `api.get`, `query` from `./client`.
- Produces:
  - `dashboard.summary(signal?)` → `Promise<DashboardSummary>`
  - `dashboard.health(signal?)` → `Promise<DashboardHealth>`
  - `dashboard.activity(limit?, signal?)` → `Promise<ActivityEntry[]>`
  - `analytics.revenue(from, to, signal?)` → `Promise<RevenuePoint[]>`
  - `analytics.gymsGrowth(from, to, signal?)` → `Promise<GrowthPoint[]>`
  - `analytics.churn(from, to, signal?)` → `Promise<ChurnPoint[]>`

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/endpoints.test.ts`, matching the file's existing style (read it first — it asserts the path each function requests):

```ts
describe('dashboard and analytics endpoints', () => {
  it('requests the dashboard operations at their contract paths', async () => {
    await dashboard.summary();
    expect(lastRequest().path).toBe('/dashboard/summary');

    await dashboard.health();
    expect(lastRequest().path).toBe('/dashboard/health');

    await dashboard.activity(50);
    expect(lastRequest().path).toBe('/dashboard/activity?limit=50');
  });

  it('sends both range bounds on every analytics series', async () => {
    // from/to are REQUIRED by the API - a series that omits one is a 400, and the failure would
    // otherwise only appear at runtime.
    await analytics.revenue('2026-08-01', '2026-08-31');
    expect(lastRequest().path).toBe('/analytics/revenue?from=2026-08-01&to=2026-08-31');

    await analytics.gymsGrowth('2026-08-01', '2026-08-31');
    expect(lastRequest().path).toBe('/analytics/gyms-growth?from=2026-08-01&to=2026-08-31');

    await analytics.churn('2026-08-01', '2026-08-31');
    expect(lastRequest().path).toBe('/analytics/churn?from=2026-08-01&to=2026-08-31');
  });
});
```

`lastRequest()` is this plan's name for whatever seam the existing file already uses to capture the fetch — **use the file's existing mechanism**, do not add a second one.

- [ ] **Step 2: Run it and watch it fail**

```
pnpm test tests/unit/endpoints.test.ts
```

Expected: FAIL — `dashboard` and `analytics` are not exported.

- [ ] **Step 3: Add the groups**

```ts
/**
 * M5's dashboard. These read **live** — computed per request from gyms and subscriptions — which is
 * why the summary can disagree with the analytics series below and both be right (F3-DESIGN D2).
 */
export const dashboard = {
  summary: (signal?: AbortSignal) => api.get<DashboardSummary>('/dashboard/summary', signal),

  health: (signal?: AbortSignal) => api.get<DashboardHealth>('/dashboard/health', signal),

  /** The audit log in a trimmed shape — gated on `audit.read`, not `analytics.read` (D10). */
  activity: (limit = 20, signal?: AbortSignal) =>
    api.get<ActivityEntry[]>(`/dashboard/activity${query({ limit })}`, signal),
};

/**
 * M5's recorded series. Served only from `daily_platform_stats`, which is written once a day and
 * never recomputed — so these answer "what was true then", and only for days the job recorded.
 * `from` and `to` are required and span at most 366 days (D7).
 */
export const analytics = {
  revenue: (from: string, to: string, signal?: AbortSignal) =>
    api.get<RevenuePoint[]>(`/analytics/revenue${query({ from, to })}`, signal),

  gymsGrowth: (from: string, to: string, signal?: AbortSignal) =>
    api.get<GrowthPoint[]>(`/analytics/gyms-growth${query({ from, to })}`, signal),

  churn: (from: string, to: string, signal?: AbortSignal) =>
    api.get<ChurnPoint[]>(`/analytics/churn${query({ from, to })}`, signal),
};
```

Add the eight type names to the file's existing `import type { … } from '@/types/api'` block.

- [ ] **Step 4: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test
```

```bash
git add src/lib/api/endpoints.ts tests/unit/endpoints.test.ts
git commit -m "feat(api): the six dashboard and analytics operations"
```

---

### Task 4: The charts foundation — Recharts, the gap helper, `ChartCard`

This task contains **the increment's central mechanism** (D3). Everything else is presentation.

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml`, `docs/DEPENDENCY_POLICY.md`
- Create: `src/lib/analytics/series.ts`, `src/components/data/chart-card.tsx`
- Test: `tests/unit/series.test.ts`

**Interfaces:**

- Produces:
  - `expandDailySeries<T extends { date: string }>(recorded: readonly T[], from: string, to: string): { date: string; recorded: T | null }[]`
  - `rangeError(from: string, to: string): string | null`
  - `MAX_RANGE_DAYS = 366`
  - `<ChartCard title description isLoading isEmpty emptyMessage>{children}</ChartCard>`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { expandDailySeries, rangeError, MAX_RANGE_DAYS } from '@/lib/analytics/series';

describe('expandDailySeries', () => {
  it('returns one row per calendar day in the range, inclusive of both ends', () => {
    const rows = expandDailySeries([], '2026-08-01', '2026-08-03');
    expect(rows.map((row) => row.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('marks a day the backend never recorded as null', () => {
    // THE test of this increment. The API returns only recorded days; if this returned a zero, or
    // dropped the day entirely, the chart would draw a straight line across a night the job never
    // ran and silently claim data that does not exist.
    const rows = expandDailySeries(
      [
        { date: '2026-08-01', total: 10 },
        { date: '2026-08-03', total: 12 },
      ],
      '2026-08-01',
      '2026-08-03',
    );

    expect(rows[0].recorded).toEqual({ date: '2026-08-01', total: 10 });
    expect(rows[1].recorded).toBeNull();
    expect(rows[2].recorded).toEqual({ date: '2026-08-03', total: 12 });
  });

  it('handles a single-day range', () => {
    expect(expandDailySeries([], '2026-08-01', '2026-08-01')).toHaveLength(1);
  });

  it('ignores recorded days outside the requested range', () => {
    const rows = expandDailySeries([{ date: '2026-07-31', total: 9 }], '2026-08-01', '2026-08-02');
    expect(rows.every((row) => row.recorded === null)).toBe(true);
  });

  it('spans a month boundary and a leap day without drifting', () => {
    // UTC arithmetic, no date library: February in a leap year is where naive month maths breaks.
    const rows = expandDailySeries([], '2028-02-27', '2028-03-01');
    expect(rows.map((row) => row.date)).toEqual([
      '2028-02-27',
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('rangeError', () => {
  it('accepts a range of exactly the maximum', () => {
    // Inclusive counting, matching the backend: to.DayNumber - from.DayNumber + 1 <= 366.
    expect(rangeError('2026-01-01', '2026-12-31')).toBeNull();
  });

  it('refuses a range one day too long', () => {
    expect(rangeError('2026-01-01', '2027-01-01')).toMatch(/366/);
  });

  it('refuses a backwards range', () => {
    expect(rangeError('2026-03-01', '2026-01-01')).toMatch(/before/i);
  });

  it('refuses a missing bound', () => {
    expect(rangeError('', '2026-01-01')).not.toBeNull();
  });

  it('exposes the cap so the UI and the message cannot drift', () => {
    expect(MAX_RANGE_DAYS).toBe(366);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```
pnpm test tests/unit/series.test.ts
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the helper**

```ts
// src/lib/analytics/series.ts

/**
 * The bridge between what the API returns and what a chart can draw.
 *
 * M5 returns **only the days it recorded** and deliberately never zero-fills: a missing day means the
 * nightly job did not run, which is not the same fact as "nothing happened". A charting library will
 * connect straight across an absent point unless it is handed an explicit `null`, so this expands the
 * recorded days across the requested range and marks the holes.
 *
 * Pure and React-free on purpose — the guarantee is testable without rendering anything.
 */

const DAY_MS = 86_400_000;

export const MAX_RANGE_DAYS = 366;

/** Parses an ISO calendar day as UTC midnight. UTC throughout, so DST never shifts a boundary. */
function toUtcMs(day: string): number {
  const ms = Date.parse(`${day}T00:00:00Z`);

  if (Number.isNaN(ms)) {
    throw new RangeError(`Not an ISO calendar day: ${day}`);
  }

  return ms;
}

function toIsoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function expandDailySeries<T extends { date: string }>(
  recorded: readonly T[],
  from: string,
  to: string,
): { date: string; recorded: T | null }[] {
  const byDate = new Map(recorded.map((point) => [point.date, point]));
  const end = toUtcMs(to);
  const rows: { date: string; recorded: T | null }[] = [];

  for (let ms = toUtcMs(from); ms <= end; ms += DAY_MS) {
    const date = toIsoDay(ms);
    rows.push({ date, recorded: byDate.get(date) ?? null });
  }

  return rows;
}

/**
 * Why this range cannot be requested, or null when it can.
 *
 * A courtesy, not the guarantee: the API enforces the same rule and `analytics.range_invalid` is
 * mapped onto the range field, so a request that slips past this still fails legibly.
 */
export function rangeError(from: string, to: string): string | null {
  if (!from || !to) {
    return 'Choose a start and an end date.';
  }

  if (toUtcMs(to) < toUtcMs(from)) {
    return 'The end date cannot be before the start date.';
  }

  const days = (toUtcMs(to) - toUtcMs(from)) / DAY_MS + 1;

  return days > MAX_RANGE_DAYS
    ? `A range covers at most ${MAX_RANGE_DAYS} days. Choose a shorter period.`
    : null;
}
```

- [ ] **Step 4: Run the tests — they must pass**

```
pnpm test tests/unit/series.test.ts
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Install Recharts with its policy entry**

```
pnpm add recharts
```

Then add a row to `docs/DEPENDENCY_POLICY.md`'s runtime allowlist, in the table's existing style:

```
| recharts | MIT | Charts for M5's analytics series; named by ARCHITECTURE.md §6 and by §5's `ChartCard`. |
```

```
node scripts/check-dependencies.mjs
```

Expected: clean. If it fails, the policy row and the check disagree — fix the row, never the check's rules.

- [ ] **Step 6: Write `ChartCard`**

```tsx
// src/components/data/chart-card.tsx
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * ARCHITECTURE.md §5's `ChartCard`: title + chart slot + empty/loading states.
 *
 * `emptyMessage` is required rather than defaulted because "no data" and "no day recorded yet" are
 * different sentences, and only the caller knows which one is true (F3-DESIGN D9).
 */
export function ChartCard({
  title,
  description,
  isLoading,
  isEmpty,
  emptyMessage,
  children,
}: {
  title: string;
  description?: string;
  isLoading: boolean;
  isEmpty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-72">
        {isLoading ? (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : isEmpty ? (
          <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
```

**Check `src/components/ui/` for `card.tsx` first.** If the project has no Card primitive, use the container markup the existing pages use for panels rather than generating a new shadcn component.

- [ ] **Step 7: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test && node scripts/check-dependencies.mjs
```

```bash
git add package.json pnpm-lock.yaml docs/DEPENDENCY_POLICY.md src tests
git commit -m "feat(analytics): the gap-preserving series helper, and Recharts with its policy entry"
```

---

### Task 5: The dashboard, its nav entry, and the landing resolver

**Files:**

- Create: `src/app/(admin)/dashboard/page.tsx`, `src/features/dashboard/{stat-tiles,health-panel,activity-feed}.tsx`
- Modify: `src/lib/nav/items.ts`, `src/app/page.tsx`
- Test: `tests/unit/landing-route.test.ts`, `tests/unit/stat-tiles.test.tsx`, `tests/unit/dashboard-page.test.tsx`

**Interfaces:**

- Consumes: `dashboard.*` (Task 3), `formatMoney` (`@/lib/utils/format`), `usePermission`/`RequirePermission`/`useSession` (`@/lib/auth/session`).
- Produces: `landingRouteFor(can: (permission: string) => boolean): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/landing-route.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { landingRouteFor, NAV_ITEMS } from '@/lib/nav/items';

describe('landingRouteFor', () => {
  it('sends an analytics reader to the dashboard', () => {
    expect(landingRouteFor((permission) => permission === 'analytics.read')).toBe('/dashboard');
  });

  it('sends everyone else to gyms', () => {
    // M5 withheld analytics.read from SupportAgent deliberately. Landing them on a page they are
    // forbidden to read would greet them with a 403 every morning.
    expect(landingRouteFor(() => false)).toBe('/gyms');
  });
});

describe('navigation', () => {
  it('gates both new entries on analytics.read', () => {
    const gated = NAV_ITEMS.filter((item) => ['/dashboard', '/analytics'].includes(item.href));

    expect(gated).toHaveLength(2);
    expect(gated.every((item) => item.permission === 'analytics.read')).toBe(true);
  });
});
```

Create `tests/unit/stat-tiles.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTiles } from '@/features/dashboard/stat-tiles';
import type { DashboardSummary } from '@/types/api';

const summary: DashboardSummary = {
  totalGyms: 5,
  activeGyms: 3,
  suspendedGyms: 1,
  provisioningGyms: 1,
  liveSubscriptions: 4,
  mrr: [
    { amount: 1234.5, currency: 'EUR' },
    { amount: 900, currency: 'JPY' },
  ],
};

describe('StatTiles', () => {
  it('renders one MRR tile per currency and never a combined total', () => {
    render(<StatTiles summary={summary} />);

    expect(screen.getByText(/€1,234.50/)).toBeInTheDocument();
    // JPY has no minor units - formatMoney handles that, and a hard-coded toFixed(2) would not.
    expect(screen.getByText(/¥900/)).toBeInTheDocument();
    // 1234.50 + 900 = 2134.50 must appear nowhere: adding unlike currencies is the coercion Money
    // exists to prevent, and a chart or tile is just another place to do it.
    expect(screen.queryByText(/2,134/)).not.toBeInTheDocument();
  });

  it('says so when nothing is billing yet, rather than showing a currency-less zero', () => {
    render(<StatTiles summary={{ ...summary, mrr: [] }} />);
    expect(screen.getByText(/no paying subscriptions/i)).toBeInTheDocument();
  });

  it('renders the gym counts', () => {
    render(<StatTiles summary={summary} />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

```
pnpm test tests/unit/landing-route.test.ts tests/unit/stat-tiles.test.tsx
```

Expected: FAIL — neither module exports what the tests import.

- [ ] **Step 3: Add the resolver and the nav entries**

In `src/lib/nav/items.ts`, add `LayoutDashboard` and `LineChart` to the `lucide-react` import, then two entries at the **top** of `NAV_ITEMS`:

```ts
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: 'analytics.read' },
  { label: 'Analytics', href: '/analytics', icon: LineChart, permission: 'analytics.read' },
```

Replace the `LANDING_ROUTE` constant and its comment with:

```ts
/**
 * Where an operator lands after signing in — resolved against what they may actually read.
 *
 * F1 and F2 both refused a dashboard landing in the same words: "a grid of zeroes teaches operators
 * to distrust the screen." M5 answered that rather than overruling it — `/dashboard/summary` is
 * computed live from gyms and subscriptions, so it is never a grid of zeroes on a fresh install, and
 * the figures that do come from the nightly job live on `/analytics` behind their own empty state.
 *
 * The permission check is not decoration: M5 deliberately withheld `analytics.read` from
 * SupportAgent, so a fixed dashboard landing would greet a support agent every morning with a page
 * they are forbidden to read.
 */
export function landingRouteFor(can: (permission: string) => boolean): string {
  return can('analytics.read') ? '/dashboard' : '/gyms';
}
```

Then fix every `LANDING_ROUTE` importer (`grep -rn "LANDING_ROUTE" src/`).

- [ ] **Step 4: Make the root page resolve client-side**

`src/app/page.tsx` is currently a server component redirecting to a constant. Permissions live in the client session, so the resolution has to happen where the session does:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { landingRouteFor } from '@/lib/nav/items';
import { useSession } from '@/lib/auth/session';

/**
 * The root is nobody's destination. It waits for the session — on a hard reload the access token is
 * being traded for a fresh one (F1 D3) — and then sends the operator to the first screen they can
 * actually use.
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
      router.replace(landingRouteFor(can));
    }
  }, [status, can, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" aria-label="Loading" />
    </div>
  );
}
```

Read `src/lib/auth/session.tsx` first to confirm `useSession()` returns `{ status, can }` and that `can` is stable enough for a dependency array; if it is recreated per render, depend on the permission list instead of the function.

- [ ] **Step 5: Write the three dashboard sections**

`src/features/dashboard/stat-tiles.tsx` — presentational, takes `{ summary: DashboardSummary }`:

```tsx
import { formatMoney } from '@/lib/utils/format';
import type { DashboardSummary } from '@/types/api';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * The live half of the dashboard (D2): computed per request, so these move the moment a gym is
 * provisioned or a subscription assigned — unlike the analytics series, which only move overnight.
 */
export function StatTiles({ summary }: { summary: DashboardSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Tile label="Gyms" value={String(summary.totalGyms)} />
      <Tile label="Active" value={String(summary.activeGyms)} />
      <Tile label="Suspended" value={String(summary.suspendedGyms)} />
      <Tile label="Provisioning" value={String(summary.provisioningGyms)} />
      <Tile label="Live subscriptions" value={String(summary.liveSubscriptions)} />

      {/*
        One tile per currency, never a sum (D4). An empty list is not "zero revenue" — it is no
        paying subscriptions at all, and a currency-less zero is a number nobody can act on.
      */}
      {(summary.mrr ?? []).length === 0 ? (
        <Tile label="Monthly recurring revenue" value="No paying subscriptions yet" />
      ) : (
        (summary.mrr ?? []).map((entry) => (
          <Tile
            key={entry.currency}
            label={`Monthly recurring revenue (${entry.currency})`}
            value={formatMoney(entry.amount, entry.currency)}
          />
        ))
      )}
    </div>
  );
}
```

`src/features/dashboard/health-panel.tsx` — takes `{ health: DashboardHealth }`, renders `health.status` and a list of `health.checks` (`name`, `status`) using the existing `StatusBadge`. Nothing else: the API deliberately omits descriptions and exception text, and the UI must not invent a place to put them.

`src/features/dashboard/activity-feed.tsx` — takes `{ entries: ActivityEntry[] }`, renders `occurredAtUtc` via `formatRelative`, plus `action`, `entityType` and `userEmail`. Empty renders the existing `EmptyState`.

Each fetches nothing; the page owns the queries.

- [ ] **Step 6: Write the page**

`src/app/(admin)/dashboard/page.tsx`, a client component following the query conventions in `src/app/(admin)/invoices/page.tsx` (array query keys, `signal` passed through; check whether the app's `QueryClient` already defaults `refetchOnWindowFocus` before setting it per-query — D8):

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTiles } from '@/features/dashboard/stat-tiles';
import { HealthPanel } from '@/features/dashboard/health-panel';
import { ActivityFeed } from '@/features/dashboard/activity-feed';
import { dashboard } from '@/lib/api/endpoints';
import { useSession } from '@/lib/auth/session';

export default function DashboardPage() {
  const { can } = useSession();
  const mayReadAnalytics = can('analytics.read');
  const mayReadAudit = can('audit.read');

  // `enabled` is not an optimisation: the two halves carry different permissions (D10), and a
  // support agent holding only audit.read would otherwise fire two requests that 403 on every load.
  const summary = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: ({ signal }) => dashboard.summary(signal),
    enabled: mayReadAnalytics,
  });

  const health = useQuery({
    queryKey: ['dashboard', 'health'],
    queryFn: ({ signal }) => dashboard.health(signal),
    enabled: mayReadAnalytics,
  });

  const activity = useQuery({
    queryKey: ['dashboard', 'activity', 20],
    queryFn: ({ signal }) => dashboard.activity(20, signal),
    enabled: mayReadAudit,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="What is true right now across the platform." />

      {mayReadAnalytics ? (
        <>
          {summary.isPending ? <Skeleton className="h-32" /> : null}
          {summary.data ? <StatTiles summary={summary.data} /> : null}
          {health.data ? <HealthPanel health={health.data} /> : null}
        </>
      ) : null}

      {mayReadAudit && activity.data ? <ActivityFeed entries={activity.data} /> : null}
    </div>
  );
}
```

Use `RequirePermission` instead of the bare `can()` branches if that reads better against the existing pages — the requirement is that the two halves gate **independently**, not which of the two mechanisms does it.

- [ ] **Step 7: Write the page test**

`tests/unit/dashboard-page.test.tsx` must prove D10 — that the two halves are gated separately:

```tsx
it('renders only the activity feed for a caller holding audit.read alone', async () => {
  renderWithSession(<DashboardPage />, { permissions: ['audit.read'] });

  expect(await screen.findByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
  expect(screen.queryByText(/monthly recurring revenue/i)).not.toBeInTheDocument();
});
```

`renderWithSession` is this plan's name for whatever session-mocking helper the existing tests use — **read `tests/unit/gym-subscription-tab.test.tsx` and reuse its approach**; if none exists, add one to `tests/setup.ts` rather than mocking the module in each file.

- [ ] **Step 8: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test
```

```bash
git add src tests
git commit -m "feat(dashboard): the console's front door, resolved per permission"
```

---

### Task 6: The analytics page

**Files:**

- Create: `src/app/(admin)/analytics/page.tsx`, `src/features/analytics/{range-picker,revenue-chart,growth-chart,churn-chart}.tsx`
- Modify: `src/lib/api/problems.ts`
- Test: `tests/unit/range-picker.test.tsx`, `tests/unit/revenue-chart.test.tsx`, `tests/unit/churn-chart.test.tsx`

**Interfaces:**

- Consumes: `analytics.*` (Task 3), `expandDailySeries`, `rangeError`, `MAX_RANGE_DAYS`, `ChartCard` (Task 4).
- Produces — pin these signatures, the tests import them by name:
  - `toRevenueRows(points: readonly RevenuePoint[], from: string, to: string): { currencies: string[]; rows: Record<string, string | number | null>[] }`
  - `toGrowthRows(points: readonly GrowthPoint[], from: string, to: string): { series: string[]; rows: Record<string, string | number | null>[] }` — `series` is `['totalGyms', 'activeGyms', 'suspendedGyms', 'provisioningGyms', 'newGyms']`
  - `toChurnRows(points: readonly ChurnPoint[], from: string, to: string): { series: string[]; rows: Record<string, string | number | null>[] }` — `series` is `['canceled', 'expired']`
  - `<RangePicker from to onChange />` where `onChange: (range: { from: string; to: string }) => void`

- [ ] **Step 1: Write the failing tests**

`tests/unit/revenue-chart.test.tsx` — the D3/D4 guarantees. Recharts does not render measurable SVG in jsdom, so **assert on the data the chart is handed**, not on pixels: export the mapping function from the chart module and test it directly.

```tsx
import { describe, expect, it } from 'vitest';
import { toRevenueRows } from '@/features/analytics/revenue-chart';
import type { RevenuePoint } from '@/types/api';

const points: RevenuePoint[] = [
  {
    date: '2026-08-01',
    mrr: [
      { amount: 100, currency: 'EUR' },
      { amount: 50, currency: 'GBP' },
    ],
  },
  // 2026-08-02 is missing: the job did not run that night.
  { date: '2026-08-03', mrr: [{ amount: 120, currency: 'EUR' }] },
];

describe('toRevenueRows', () => {
  it('gives a missing day null for every currency, so the line breaks', () => {
    const { rows } = toRevenueRows(points, '2026-08-01', '2026-08-03');

    expect(rows[1].date).toBe('2026-08-02');
    expect(rows[1].EUR).toBeNull();
    expect(rows[1].GBP).toBeNull();
  });

  it('gives a recorded day without a currency null rather than zero for it', () => {
    // 2026-08-03 has no GBP entry. Zero would claim the GBP book collapsed; null says nothing was
    // recorded for it, which is what actually happened.
    const { rows } = toRevenueRows(points, '2026-08-01', '2026-08-03');
    expect(rows[2].EUR).toBe(120);
    expect(rows[2].GBP).toBeNull();
  });

  it('reports one series per currency, ordered stably, and never a combined one', () => {
    const { currencies, rows } = toRevenueRows(points, '2026-08-01', '2026-08-03');

    expect(currencies).toEqual(['EUR', 'GBP']);
    expect(rows.some((row) => 'total' in row)).toBe(false);
  });
});
```

`tests/unit/churn-chart.test.tsx`:

```tsx
it('keeps cancellations and expiries as separate series', () => {
  const { series } = toChurnRows(
    [{ date: '2026-08-01', canceled: 2, expired: 3, total: 5 }],
    '2026-08-01',
    '2026-08-01',
  );
  // Grouped, not stacked: comparing the two causes is the whole reason M5 stores them apart.
  expect(series).toEqual(['canceled', 'expired']);
});
```

`tests/unit/range-picker.test.tsx`:

```tsx
it('refuses a span longer than the cap before sending it', async () => {
  const onChange = vi.fn();
  render(<RangePicker from="2026-01-01" to="2026-01-01" onChange={onChange} />);

  await userEvent.clear(screen.getByLabelText(/to/i));
  await userEvent.type(screen.getByLabelText(/to/i), '2027-06-01');

  expect(screen.getByText(/366 days/)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them and watch them fail**

```
pnpm test tests/unit/revenue-chart.test.tsx tests/unit/churn-chart.test.tsx tests/unit/range-picker.test.tsx
```

Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Write the mapping functions and charts**

Each chart module exports a pure mapper **and** the component, so the guarantees are testable without rendering:

```ts
// src/features/analytics/revenue-chart.tsx
export function toRevenueRows(
  points: readonly RevenuePoint[],
  from: string,
  to: string,
): { currencies: string[]; rows: Record<string, string | number | null>[] } {
  const currencies = [
    ...new Set(points.flatMap((point) => (point.mrr ?? []).map((entry) => entry.currency))),
  ].sort();

  const rows = expandDailySeries(points, from, to).map((row) => {
    const cells: Record<string, string | number | null> = { date: row.date };

    for (const currency of currencies) {
      const entry = row.recorded?.mrr?.find((item) => item.currency === currency);
      // null, never 0: an absent amount is "not recorded", and 0 would draw the book collapsing.
      cells[currency] = entry ? Number(entry.amount) : null;
    }

    return cells;
  });

  return { currencies, rows };
}
```

The component renders one Recharts `<Line>` per currency with `connectNulls={false}` — **which must never be set true** — inside a `<ChartCard>`. `growth-chart.tsx` and `churn-chart.tsx` follow the same shape: a mapper plus a component, `toGrowthRows` returning the four status series plus `newGyms`, `toChurnRows` returning `['canceled', 'expired']` as grouped `<Bar>`s with `total` in the tooltip.

Every chart's `ChartCard` gets an `emptyMessage` distinguishing the two empties (D9): when the whole range is unrecorded, "No days recorded in this range yet — the first row lands after the nightly run at 03:30 UTC."

- [ ] **Step 4: Write the range picker and the page**

`range-picker.tsx` holds two date inputs plus preset buttons (7 days, 30 days, 90 days, 12 months), calls `rangeError` on every change, renders the message and **withholds `onChange` while it is non-null**.

`src/app/(admin)/analytics/page.tsx` owns the range state (default **30 days**, ending today), runs the three queries with `enabled: rangeError(from, to) === null`, and renders three `ChartCard`s. Put one line under the page header stating what the reader is looking at: recorded daily, today not yet included — D2's disagreement, explained once where it is visible.

- [ ] **Step 5: Map the error code**

In `src/lib/api/problems.ts`, add to `MESSAGES`:

```ts
  // Analytics
  'analytics.range_invalid':
    'That date range cannot be charted. Choose a period of at most 366 days, ending on or after it starts.',
```

- [ ] **Step 6: Verify and commit**

```
pnpm typecheck && pnpm lint && pnpm test
```

```bash
git add src tests
git commit -m "feat(analytics): three series that break at gaps and never combine currencies"
```

---

### Task 7: End-to-end, as-built notes, and full verification

**Files:**

- Create: `tests/e2e/dashboard-analytics.spec.ts`, `docs/F3-AS-BUILT.md`
- Modify: `docs/F3-DESIGN.md` (status line only)

- [ ] **Step 1: Write the E2E journey**

Read `tests/e2e/` first and follow its existing sign-in helper and viewport matrix. The journey:

1. Sign in as the seeded SuperAdmin → the URL settles on `/dashboard`.
2. The gym-count tile matches the number of rows on `/gyms`.
3. Open Analytics → either a chart renders or the day-one empty state does. **Accept both**: whether a stats row exists depends on whether the nightly job has run against the environment, and a test that demands one will fail on a fresh database for a reason that is not a defect.
4. Set a range wider than 366 days → the message appears and no request is sent.

- [ ] **Step 2: Run the full suite at both viewports**

```
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test
pnpm test:e2e
node scripts/check-dependencies.mjs
```

Every one must be clean. Record each command's output line.

- [ ] **Step 3: Verify against a running backend**

With the backend stack up (`docker compose up -d --build` in `../GymOS-Backend`) and `pnpm dev` running:

1. The dashboard's gym count matches `/gyms`.
2. Assign a subscription in the UI → **the MRR tile moves on the next focus/refresh**, because the summary is live.
3. The analytics series does **not** move — no stats row has been written for today, and will not be until the nightly job runs.

That third point is the increment's whole architecture, demonstrated rather than asserted. Record what you actually observed, including anything that did not work.

- [ ] **Step 4: Write `docs/F3-AS-BUILT.md`**

Follow `docs/F2-AS-BUILT.md`'s structure. Record what was built, what the design got wrong (there will be something), the live-run observations from Step 3, and a "Follow-ups, deliberately not done" section. Flip `docs/F3-DESIGN.md`'s status line to built.

- [ ] **Step 5: Commit and stop for review**

```bash
git add docs tests
git commit -m "test(f3): the dashboard-and-analytics journey; docs: F3 as built"
```

Do not start F4. Report: what was built, the verified test counts, what the live run showed, and the two things this plan knows it is carrying — Recharts as a new runtime dependency, and the `toastApiError` migration touching files F3 does not otherwise own.
