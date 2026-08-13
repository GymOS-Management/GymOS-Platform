# F4 — Feature-flags console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the console for M4's feature flags — the catalogue, each gym's resolved features with its exceptions, and what each plan includes.

**Architecture:** Three surfaces over six existing endpoints. Two shared presentational primitives (`SourceBadge`, `FeatureGroupList`) and three deliberately separate controls, because the surfaces answer three different questions. All decision logic that could rot lives in pure functions under `src/lib/features/` so it is unit-testable without a DOM.

**Tech Stack:** Next.js (see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing route code), React 19, TanStack Query, Tailwind v4, shadcn/ui primitives, `sonner` toasts, vitest + Testing Library, Playwright.

**Spec:** [`docs/F4-DESIGN.md`](../../F4-DESIGN.md) — read it first. Every task below cites the decision (D1–D11) it implements. Where this plan and the spec disagree, the spec wins; where the spec and `GymOS-Backend/docs/BusinessRules/Features.md` disagree, Features.md wins.

## Global Constraints

- **No new runtime dependencies.** F3 shipped its charts under this rule; F4 has no reason to break it. A new devDependency needs `docs/DEPENDENCY_POLICY.md`'s change process.
- **`usePermission` hides UI and never authorises** (F1's standing rule). Every request is authorised by the API regardless of what rendered.
- **Feature keys are never created, deleted, or edited by this console.** `UpdateFeatureRequest` has no key field, deliberately.
- **A null `adoptionCount` / `overrideCount` renders as absent, never `0`** (D11). Write responses return them null.
- **`If-Match` on `PUT /features/{id}` and `PUT /plans/{id}/features`; none on `PUT /gyms/{id}/features`** (D10).
- **A reason is required on every gym feature value change** (D6).
- **Copy is British English**, matching the existing console ("authorise", "recognised").
- **Every E2E nav click needs the `isMobile` drawer branch** — omitting it cost nine silently skipped tests (`ce4fa4b`).
- **Gate before every commit:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`.

---

### Task 1: Regenerate the API types and re-export the feature schemas

Implements D-none (prerequisite, spec §3). The generated types are stale by one increment; the diff carries the activation review's unrelated contract changes and must be **read**, not accepted.

**Files:**

- Modify: `src/types/api.d.ts` (by command, never by hand)
- Modify: `src/types/api.ts`

**Interfaces:**

- Produces: `FeatureListItem`, `ResolvedFeatureDetail`, `UpdateFeatureRequest`, `SetPlanFeaturesRequest`, `SetGymFeaturesRequest`, `PlanFeatureRequest`, `GymFeatureRequest` — all exported from `@/types/api`.

- [ ] **Step 1: Record the baseline**

```bash
cd /c/Work/Personal-Projects/GymOS/GymOS-Platform
git rev-parse --short HEAD
wc -l src/types/api.d.ts
```

- [ ] **Step 2: Regenerate**

```bash
pnpm gen:api
```

- [ ] **Step 3: Read the diff and account for every change**

```bash
git diff --stat src/types/api.d.ts
git diff src/types/api.d.ts | head -200
```

Expected: changes fall into exactly two groups — (a) feature schemas, which F4 consumes, and (b) activation-endpoint changes from `a74967f` (the check endpoint's 410-versus-404 correction among them). **If you find a third group, stop and report it.** Do not proceed with an unexplained contract change; that is the failure mode the M1.3 snapshot gate exists to prevent.

- [ ] **Step 4: Re-export the feature schemas**

In `src/types/api.ts`, following the existing `export type X = Schemas['Y'];` pattern, append after the plans block:

```ts
export type FeatureListItem = Schemas['FeatureListItem'];
export type ResolvedFeatureDetail = Schemas['ResolvedFeatureDetail'];
export type UpdateFeatureRequest = Schemas['UpdateFeatureRequest'];
export type SetPlanFeaturesRequest = Schemas['SetPlanFeaturesRequest'];
export type SetGymFeaturesRequest = Schemas['SetGymFeaturesRequest'];
export type PlanFeatureRequest = Schemas['PlanFeatureRequest'];
export type GymFeatureRequest = Schemas['GymFeatureRequest'];
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/api.d.ts src/types/api.ts
git commit -m "Regenerate API types for F4, and read the diff

Carries the activation review's contract changes as well as the feature
schemas, because the console's types were a commit behind. Both groups
accounted for; no third group present."
```

---

### Task 2: Extract `toastApiError`, and migrate all 41 call sites

Implements **D8**. F2's review judged this earned at 26 occurrences across 17 files; it is now 41 across 22. Do this before F4's surfaces so they use it from the start.

**Files:**

- Create: `src/lib/feedback/toast-api-error.ts`
- Create: `src/components/feedback/api-error-text.tsx`
- Create: `tests/unit/toast-api-error.test.tsx`
- Modify: all 22 files containing `instanceof ApiError` (enumerate them in Step 5 — do not trust this plan's count)

**Interfaces:**

- Consumes: `ApiError` from `@/lib/api/problems`
- Produces:
  - `apiErrorMessage(error: unknown): string`
  - `toastApiError(error: unknown, title?: string): void`
  - `ApiErrorText({ error }: { error: unknown }): React.ReactElement | null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/toast-api-error.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';
import { ApiError } from '@/lib/api/problems';

describe('apiErrorMessage', () => {
  it('uses the ApiError message, which problems.ts has already made human', () => {
    const error = new ApiError(404, 'gyms.not_found', 'That gym no longer exists.');

    expect(apiErrorMessage(error)).toBe('That gym no longer exists.');
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(apiErrorMessage(new TypeError('fetch failed'))).toBe('Something went wrong.');
    expect(apiErrorMessage('a string')).toBe('Something went wrong.');
    expect(apiErrorMessage(undefined)).toBe('Something went wrong.');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test toast-api-error`
Expected: FAIL — cannot resolve `@/lib/feedback/toast-api-error`.

If `ApiError`'s constructor signature differs from `(status, code, message)`, read `src/lib/api/problems.ts` and correct the test before implementing. The test must fail because the module is missing, not because the constructor call is wrong.

- [ ] **Step 3: Implement**

Create `src/lib/feedback/toast-api-error.ts`:

```ts
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/problems';

/**
 * The sentence to show for a failed request.
 *
 * `ApiError.message` is already the human copy — `problems.ts` maps the stable code to it — so this
 * adds no wording of its own beyond the fallback for a failure that never reached the API at all
 * (a dropped connection, a bug in our own code).
 */
export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.';
}

/** The same message, as a toast. The overwhelmingly common way this console reports a failure. */
export function toastApiError(error: unknown, title?: string): void {
  const message = apiErrorMessage(error);

  if (title) {
    toast.error(title, { description: message });
    return;
  }

  toast.error(message);
}
```

Create `src/components/feedback/api-error-text.tsx`:

```tsx
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';

/**
 * The same message, rendered in place — for the forms that show a failure beside the field or under
 * the submit button rather than as a toast.
 */
export function ApiErrorText({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return (
    <p role="alert" className="text-destructive text-sm">
      {apiErrorMessage(error)}
    </p>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test toast-api-error`
Expected: PASS, 2 tests.

- [ ] **Step 5: Enumerate the call sites**

```bash
git grep -n 'instanceof ApiError' -- src
git grep -c 'instanceof ApiError' -- src | awk -F: '{s+=$2} END {print "total:", s}'
```

Record the count. It was 41 across 22 files when this plan was written.

- [ ] **Step 6: Migrate each call site**

For every occurrence of the toast form, e.g. in `src/app/(admin)/gyms/[gymId]/page.tsx:260-262`:

```tsx
// before
const fail = (error: unknown) => {
  toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
};

// after
const fail = (error: unknown) => {
  toastApiError(error);
};
```

Add `import { toastApiError } from '@/lib/feedback/toast-api-error';` and **remove the now-unused `ApiError` import only where nothing else in the file uses it** — several files also call `error instanceof ApiError` for control flow (checking `isStale`), and those keep the import.

For occurrences that render the message inline rather than toasting, use `<ApiErrorText error={error} />`.

- [ ] **Step 7: Verify none remain, and that nothing broke**

```bash
git grep -n "instanceof ApiError ? " -- src   # expect: no matches
git grep -c "Something went wrong" -- src      # expect: 1 (the helper itself)
pnpm typecheck && pnpm lint && pnpm test
```

Expected: the ternary is gone, the literal appears once, and all existing unit tests still pass. **If a test fails, the migration changed behaviour somewhere — fix it rather than updating the test.**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Extract toastApiError, two increments after the review that asked for it

F2's whole-branch review counted the ApiError ternary 26 times across 17
files and judged one extraction clearly earned. F3's plan made it Task 2
and it did not land, so F3 became copies 27-41. F4 adds three surfaces
with error paths; it builds on the helper instead of reaching 47."
```

---

### Task 3: The endpoint functions

Implements **D10** (where `If-Match` goes).

**Files:**

- Modify: `src/lib/api/endpoints.ts`
- Test: `tests/unit/endpoints.test.ts` (extend the existing file)

**Interfaces:**

- Consumes: `api`, `query` from `@/lib/api/client`; the Task 1 types
- Produces:
  - `features.list(signal?): Promise<FeatureListItem[]>`
  - `features.update(featureId: string, body: UpdateFeatureRequest, rowVersion: string): Promise<FeatureListItem>`
  - `gyms.features(gymId: string, signal?): Promise<ResolvedFeatureDetail[]>`
  - `gyms.setFeatures(gymId: string, body: SetGymFeaturesRequest): Promise<ResolvedFeatureDetail[]>`
  - `plans.features(planId: string, signal?): Promise<PlanDetail>`
  - `plans.setFeatures(planId: string, body: SetPlanFeaturesRequest, rowVersion: string): Promise<PlanDetail>`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/endpoints.test.ts`, matching the file's existing style for asserting method/path/precondition:

```ts
describe('features endpoints', () => {
  it('lists the catalogue with no query string — it is seeded, not paged', async () => {
    const call = await capture(() => features.list());

    expect(call.method).toBe('GET');
    expect(call.path).toBe('/features');
  });

  it('sends If-Match on a catalogue edit', async () => {
    const call = await capture(() =>
      features.update(
        'f1',
        {
          name: 'CRM',
          description: null,
          category: 'Members',
          defaultEnabled: true,
          isPremium: true,
        },
        'v7',
      ),
    );

    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/features/f1');
    expect(call.precondition).toBe('v7');
  });

  it('sends NO If-Match when setting a gym’s features — each override is its own aggregate', async () => {
    const call = await capture(() =>
      gyms.setFeatures('g1', { features: [{ key: 'crm', isEnabled: true, reason: 'trial' }] }),
    );

    expect(call.method).toBe('PUT');
    expect(call.path).toBe('/gyms/g1/features');
    expect(call.precondition).toBeUndefined();
  });

  it('sends If-Match when setting a plan’s contents', async () => {
    const call = await capture(() =>
      plans.setFeatures('p1', { features: [{ key: 'crm', isEnabled: null }] }, 'v3'),
    );

    expect(call.precondition).toBe('v3');
  });
});
```

Use whatever helper the existing file already uses to observe requests; if it is named something other than `capture`, use that name. Read the file before writing.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test endpoints`
Expected: FAIL — `features` is not exported.

- [ ] **Step 3: Implement**

Add to `src/lib/api/endpoints.ts`, after the `plans` group:

```ts
export const features = {
  /** Not paged: the catalogue is seeded and there are twelve keys. */
  list: (signal?: AbortSignal) => api.get<FeatureListItem[]>('/features', signal),

  /**
   * Copy, default and premium. The key is absent because it is immutable — a field the server
   * ignores is worse than no field (FeatureContracts.cs).
   */
  update: (featureId: string, body: UpdateFeatureRequest, rowVersion: string) =>
    api.put<FeatureListItem>(`/features/${featureId}`, body, { precondition: rowVersion }),
};
```

Add to the existing `gyms` group:

```ts
  /** The whole catalogue resolved for this gym, with the layer that decided each answer. */
  features: (gymId: string, signal?: AbortSignal) =>
    api.get<ResolvedFeatureDetail[]>(`/gyms/${gymId}/features`, signal),

  /**
   * No `precondition`, deliberately: each override is its own aggregate keyed on (gym, feature) and
   * the request merges per key, so two operators editing different features do not conflict at all
   * (Features.md, "Where If-Match is required, and where it is not").
   */
  setFeatures: (gymId: string, body: SetGymFeaturesRequest) =>
    api.put<ResolvedFeatureDetail[]>(`/gyms/${gymId}/features`, body),
```

Add to the existing `plans` group:

```ts
  /** Returns the plan: features are part of it. */
  features: (planId: string, signal?: AbortSignal) =>
    api.get<PlanDetail>(`/plans/${planId}/features`, signal),

  setFeatures: (planId: string, body: SetPlanFeaturesRequest, rowVersion: string) =>
    api.put<PlanDetail>(`/plans/${planId}/features`, body, { precondition: rowVersion }),
```

Import the new types at the top of the file alongside the existing type imports.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test endpoints`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/endpoints.ts tests/unit/endpoints.test.ts
git commit -m "Add the six feature endpoints, with If-Match exactly where the API wants it"
```

---

### Task 4: The pure decision functions

Implements **D2** (tri-state mapping) and **D5** (override age). These are the rules most likely to rot silently, so they live outside React and are tested directly.

**Files:**

- Create: `src/lib/features/plan-state.ts`
- Create: `src/lib/features/override-age.ts`
- Create: `tests/unit/plan-state.test.ts`
- Create: `tests/unit/override-age.test.ts`

**Interfaces:**

- Produces:
  - `type PlanFeatureState = 'included' | 'excluded' | 'default'`
  - `toRequestValue(state: PlanFeatureState): boolean | null`
  - `fromResponseValue(isEnabled: boolean | null | undefined): PlanFeatureState`
  - `REVIEW_AFTER_DAYS: 90`
  - `interface OverrideAge { days: number; needsReview: boolean }`
  - `overrideAge(setAtUtc: string, now: Date): OverrideAge`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/plan-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromResponseValue, toRequestValue } from '@/lib/features/plan-state';

describe('the plan’s three states', () => {
  it('maps each state to the value the API expects', () => {
    expect(toRequestValue('included')).toBe(true);
    expect(toRequestValue('excluded')).toBe(false);
    // null clears the plan's opinion. Not false: "this plan excludes CRM" and "this plan has no
    // view on CRM" answer differently the moment the platform default moves.
    expect(toRequestValue('default')).toBeNull();
  });

  it('reads a response back into a state, treating absence as silence', () => {
    expect(fromResponseValue(true)).toBe('included');
    expect(fromResponseValue(false)).toBe('excluded');
    expect(fromResponseValue(null)).toBe('default');
    expect(fromResponseValue(undefined)).toBe('default');
  });
});
```

Create `tests/unit/override-age.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { overrideAge, REVIEW_AFTER_DAYS } from '@/lib/features/override-age';

const now = new Date('2026-08-13T12:00:00Z');

describe('how old a granted exception is', () => {
  it('counts whole days since it was set', () => {
    expect(overrideAge('2026-08-01T12:00:00Z', now).days).toBe(12);
  });

  it('does not ask for review before the threshold', () => {
    const justUnder = new Date(now.getTime() - (REVIEW_AFTER_DAYS - 1) * 86_400_000);

    expect(overrideAge(justUnder.toISOString(), now).needsReview).toBe(false);
  });

  it('asks for review at the threshold and beyond', () => {
    const exactly = new Date(now.getTime() - REVIEW_AFTER_DAYS * 86_400_000);
    const beyond = new Date(now.getTime() - (REVIEW_AFTER_DAYS + 40) * 86_400_000);

    expect(overrideAge(exactly.toISOString(), now).needsReview).toBe(true);
    expect(overrideAge(beyond.toISOString(), now).needsReview).toBe(true);
  });

  it('clamps a future timestamp to zero rather than reporting negative days', () => {
    // A clock skew between host and browser must not render "granted -1 days ago".
    expect(overrideAge('2026-08-14T12:00:00Z', now).days).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test plan-state override-age`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Implement**

Create `src/lib/features/plan-state.ts`:

```ts
/**
 * What a plan says about one feature.
 *
 * `default` is not "off". A `plan_features` row is an opinion and its absence is silence: a plan
 * that excludes CRM and a plan with no view on CRM look identical to a gym today, and answer
 * differently the moment the platform default moves. That third state is why resolution has three
 * layers rather than two (Features.md).
 */
export type PlanFeatureState = 'included' | 'excluded' | 'default';

export function toRequestValue(state: PlanFeatureState): boolean | null {
  if (state === 'included') return true;
  if (state === 'excluded') return false;
  return null;
}

export function fromResponseValue(isEnabled: boolean | null | undefined): PlanFeatureState {
  if (isEnabled === true) return 'included';
  if (isEnabled === false) return 'excluded';
  return 'default';
}
```

Create `src/lib/features/override-age.ts`:

```ts
/**
 * When a granted exception starts asking to be looked at again.
 *
 * A **display hint, not a rule.** Nothing expires, nothing is withheld, and no request is refused
 * because of this number — the backend has no concept of it. Ninety days matches the goodwill-trial
 * example Features.md uses when explaining that an override, once granted, is permanent until a
 * human remembers it.
 */
export const REVIEW_AFTER_DAYS = 90;

export interface OverrideAge {
  days: number;
  needsReview: boolean;
}

const MS_PER_DAY = 86_400_000;

export function overrideAge(setAtUtc: string, now: Date): OverrideAge {
  const elapsed = now.getTime() - Date.parse(setAtUtc);
  // Clamped: a browser clock behind the host's would otherwise render "granted -1 days ago", which
  // reads as a bug in the data rather than as a clock disagreement.
  const days = Math.max(0, Math.floor(elapsed / MS_PER_DAY));

  return { days, needsReview: days >= REVIEW_AFTER_DAYS };
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test plan-state override-age`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features tests/unit/plan-state.test.ts tests/unit/override-age.test.ts
git commit -m "The two feature rules that could rot silently, as pure functions"
```

---

### Task 5: `SourceBadge` and `FeatureGroupList`

Implements **D1** (the only two things genuinely shared).

**Files:**

- Create: `src/features/feature-flags/source-badge.tsx`
- Create: `src/features/feature-flags/feature-group-list.tsx`
- Create: `tests/unit/source-badge.test.tsx`

**Interfaces:**

- Produces:
  - `SourceBadge({ source }: { source: string }): React.ReactElement`
  - `FeatureGroupList<T>({ items, categoryOf, children }): React.ReactElement` where `children: (item: T) => React.ReactNode`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/source-badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceBadge } from '@/features/feature-flags/source-badge';

describe('SourceBadge', () => {
  it.each([
    ['Override', 'Override'],
    ['Plan', 'Plan'],
    ['Default', 'Default'],
  ])('names the layer that decided the answer: %s', (source, expected) => {
    render(<SourceBadge source={source} />);

    expect(screen.getByText(expected)).toBeVisible();
  });

  it('renders an unrecognised source rather than dropping it', () => {
    // A fourth layer would be a backend change; showing the raw value beats showing nothing.
    render(<SourceBadge source="Something" />);

    expect(screen.getByText('Something')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test source-badge`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/feature-flags/source-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

/**
 * Which of the three layers decided this feature's answer.
 *
 * `override ?? plan ?? platform default` — the source is returned by the API because "is POS on?"
 * and "why is POS on?" are the same question in a support conversation (Features.md).
 */
export function SourceBadge({ source }: { source: string }) {
  const variant = source === 'Override' ? 'default' : source === 'Plan' ? 'secondary' : 'outline';

  return <Badge variant={variant}>{source}</Badge>;
}
```

Create `src/features/feature-flags/feature-group-list.tsx`:

```tsx
import * as React from 'react';

/**
 * Groups features under their category heading, in first-seen order.
 *
 * `Category` is a display grouping and nothing branches on it (Features.md) — which is exactly why
 * this component reads it as an opaque string rather than switching on a known set. A category
 * added to the catalogue tomorrow renders without a change here.
 */
export function FeatureGroupList<T>({
  items,
  categoryOf,
  children,
}: {
  items: readonly T[];
  categoryOf: (item: T) => string;
  children: (item: T) => React.ReactNode;
}) {
  const groups: { category: string; items: T[] }[] = [];

  for (const item of items) {
    const category = categoryOf(item);
    const existing = groups.find((group) => group.category === category);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ category, items: [item] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h3 className="text-muted-foreground mb-2 text-sm font-medium">{group.category}</h3>
          <div className="space-y-2">{group.items.map((item) => children(item))}</div>
        </section>
      ))}
    </div>
  );
}
```

If `@/components/ui/badge` does not exist or its variants differ, read `src/components/ui/` and use what is there — do not add a shadcn component for this.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test source-badge`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/feature-flags tests/unit/source-badge.test.tsx
git commit -m "The two presentational primitives the three feature surfaces share"
```

---

### Task 6: The catalogue screen

Implements **D7** (undeclared rows) and **D11** (null counts), plus the nav entry.

**Files:**

- Create: `src/app/(admin)/features/page.tsx`
- Create: `src/features/feature-flags/feature-catalogue-table.tsx`
- Create: `tests/unit/feature-catalogue-table.test.tsx`
- Modify: `src/components/layout/app-shell.tsx` (nav entry)

**Interfaces:**

- Consumes: `features.list` (Task 3), `FeatureGroupList` (Task 5), `FeatureListItem` (Task 1)
- Produces: `FeatureCatalogueTable({ items, canManage, onEdit }): React.ReactElement`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/feature-catalogue-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureCatalogueTable } from '@/features/feature-flags/feature-catalogue-table';
import type { FeatureListItem } from '@/types/api';

function feature(overrides: Partial<FeatureListItem> = {}): FeatureListItem {
  return {
    id: 'f1',
    key: 'crm',
    name: 'CRM',
    description: 'Customer relationships',
    category: 'Members',
    defaultEnabled: false,
    isPremium: true,
    adoptionCount: 42,
    overrideCount: 3,
    rowVersion: 'v1',
    isDeclared: true,
    ...overrides,
  } as FeatureListItem;
}

describe('the catalogue', () => {
  it('shows adoption and override counts', () => {
    render(<FeatureCatalogueTable items={[feature()]} canManage onEdit={vi.fn()} />);

    expect(screen.getByText('42')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
  });

  it('shows no count at all when the API returned null, never a zero', () => {
    // A write response returns these null. Rendering 0 would tell the operator "no gyms use this"
    // in the very moment after they edited it.
    render(
      <FeatureCatalogueTable
        items={[feature({ adoptionCount: null, overrideCount: null })]}
        canManage
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByText('0')).toBeNull();
  });

  it('marks a feature no module declares any more, and refuses to edit it', () => {
    render(
      <FeatureCatalogueTable items={[feature({ isDeclared: false })]} canManage onEdit={vi.fn()} />,
    );

    expect(screen.getByText(/no module declares this key/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
  });

  it('offers no edit affordance without features.manage', () => {
    render(<FeatureCatalogueTable items={[feature()]} canManage={false} onEdit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test feature-catalogue-table`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the table**

Create `src/features/feature-flags/feature-catalogue-table.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FeatureGroupList } from '@/features/feature-flags/feature-group-list';
import type { FeatureListItem } from '@/types/api';

/**
 * A count the API did not compute, rendered as nothing.
 *
 * `adoptionCount` and `overrideCount` are null on every write response. Rendering null as `0` would
 * report "no gyms use this" at exactly the moment an operator finished editing it.
 */
function Count({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return null;
  }

  return (
    <span className="text-muted-foreground text-sm">
      {label} <span className="text-foreground font-medium">{value}</span>
    </span>
  );
}

export function FeatureCatalogueTable({
  items,
  canManage,
  onEdit,
}: {
  items: readonly FeatureListItem[];
  canManage: boolean;
  onEdit: (feature: FeatureListItem) => void;
}) {
  return (
    <FeatureGroupList items={items} categoryOf={(item) => item.category}>
      {(item) => (
        <div
          key={item.id}
          className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${
            item.isDeclared ? '' : 'border-dashed opacity-70'
          }`}
        >
          <div className="min-w-48 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.name}</span>
              <code className="text-muted-foreground text-xs">{item.key}</code>
              {item.isPremium && <Badge variant="outline">Premium</Badge>}
            </div>
            <p className="text-muted-foreground text-sm">{item.description}</p>
            {!item.isDeclared && (
              // The whole reason M4.1 added `isDeclared`: an orphan left by a rename is otherwise
              // indistinguishable from a live feature, "flagged only in a startup log nobody reads
              // at 2am". It is never deleted, because dropping it would cascade into plan contents
              // and gym overrides.
              <p className="text-destructive mt-1 text-sm">
                No module declares this key any more. It is kept because deleting it would remove
                plan contents and gym overrides that still reference it.
              </p>
            )}
          </div>

          <Badge variant={item.defaultEnabled ? 'default' : 'outline'}>
            Default {item.defaultEnabled ? 'on' : 'off'}
          </Badge>

          <Count label="Adopted by" value={item.adoptionCount} />
          <Count label="Overrides" value={item.overrideCount} />

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={!item.isDeclared}
              onClick={() => onEdit(item)}
            >
              Edit
            </Button>
          )}
        </div>
      )}
    </FeatureGroupList>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test feature-catalogue-table`
Expected: PASS, 4 tests.

- [ ] **Step 5: Build the page**

Create `src/app/(admin)/features/page.tsx`, following the structure of `src/app/(admin)/plans/page.tsx` (read it first): a `PageHeader`, a `useQuery` on `['features']` calling `features.list`, a `Skeleton` while loading, an `EmptyState` if the list is empty, and `FeatureCatalogueTable` otherwise. Gate `canManage` on `usePermission('features.manage')`. Wire `onEdit` to state that opens the Task 7 form; until Task 7 lands, `onEdit` may open nothing — but do not ship that state past Task 7.

- [ ] **Step 6: Add the nav entry**

In `src/components/layout/app-shell.tsx`, add a `Features` item to the nav list beside the existing entries, gated on `features.read` the way the other permission-gated entries are. Use a lucide icon already imported in that file if one fits (`ToggleLeft` or `Flag` if available); otherwise import one — lucide is already a dependency.

- [ ] **Step 7: See it in the browser**

Start the stack per `tests/e2e/README.md`, sign in, visit `/features`, and confirm twelve features render under six category headings with counts.

- [ ] **Step 8: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "The feature catalogue screen, with orphans marked and null counts absent"
```

---

### Task 7: Catalogue editing, and the default-flip confirmation

Implements **D4** and **D10**.

**Files:**

- Create: `src/features/feature-flags/feature-edit-form.tsx`
- Create: `tests/unit/feature-edit-form.test.tsx`
- Modify: `src/app/(admin)/features/page.tsx`

**Interfaces:**

- Consumes: `features.update` (Task 3), `ConfirmDialog` from `@/components/feedback/confirm-dialogs`, `ApiErrorText` (Task 2)
- Produces: `FeatureEditForm({ feature, busy, error, onSubmit, onCancel }): React.ReactElement` where `onSubmit: (body: UpdateFeatureRequest) => void`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/feature-edit-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeatureEditForm } from '@/features/feature-flags/feature-edit-form';
import type { FeatureListItem } from '@/types/api';

const crm = {
  id: 'f1',
  key: 'crm',
  name: 'CRM',
  description: 'Customer relationships',
  category: 'Members',
  defaultEnabled: false,
  isPremium: true,
  adoptionCount: 42,
  overrideCount: 3,
  rowVersion: 'v1',
  isDeclared: true,
} as FeatureListItem;

describe('editing a catalogue entry', () => {
  it('shows the key but never lets it be edited', () => {
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('crm')).toBeVisible();
    expect(screen.queryByLabelText(/key/i)).toBeNull();
  });

  it('saves a copy change without any confirmation', async () => {
    const onSubmit = vi.fn();
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Customer CRM');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Customer CRM' }));
  });

  it('confirms a default flip, and admits it cannot say how many gyms are affected', async () => {
    const onSubmit = vi.fn();
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText(/enabled by default/i));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Not saved yet — the widest-blast-radius write in the module asks first.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/re-answers CRM for every gym/i)).toBeVisible();
    expect(
      screen.getByText(/cannot tell you exactly how many gyms follow the default/i),
    ).toBeVisible();
    // The two counts it genuinely has.
    expect(screen.getByText(/42/)).toBeVisible();
    expect(screen.getByText(/3/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /change default/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ defaultEnabled: true }));
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test feature-edit-form`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/feature-flags/feature-edit-form.tsx`. Requirements the test pins:

- Fields: `Name`, `Description`, `Category`, a checkbox labelled `Enabled by default`, a checkbox labelled `Premium`. The key renders as read-only text and has **no input**.
- `Name` is validated client-side at 120 characters (`features.name_invalid` is the backstop, not the mechanism).
- On submit, if `defaultEnabled` differs from `feature.defaultEnabled`, open a `ConfirmDialog` instead of submitting. Its description must state that the flip re-answers the feature **for every gym with neither an override nor a plan opinion**, show `adoptionCount` and `overrideCount` when they are non-null, and say plainly that the exact number of gyms following the default is not something the API exposes. Confirm label: `Change default`.
- Render `<ApiErrorText error={error} />` above the buttons.
- Disable the submit button while `busy`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test feature-edit-form`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into the page**

In `src/app/(admin)/features/page.tsx`, hold the feature being edited in state and render `FeatureEditForm` in a dialog or inline panel. The mutation:

```tsx
const save = useMutation({
  mutationFn: ({ feature, body }: { feature: FeatureListItem; body: UpdateFeatureRequest }) =>
    features.update(feature.id, body, feature.rowVersion),
  onSuccess: () => {
    toast.success('Feature updated.');
    setEditing(null);
    // Refetched rather than patched from the response: a write response returns null counts (D11),
    // so writing it into the cache would blank the adoption figures the list just showed.
    void queryClient.invalidateQueries({ queryKey: ['features'] });
  },
  onError: toastApiError,
});
```

That comment is load-bearing — do not replace the invalidate with a cache write.

- [ ] **Step 6: Verify the stale-write path by hand**

With the app running, open `/features` in two tabs. Edit a feature in tab A and save. In tab B, edit the same feature and save. Expected: tab B reports the stale-version message from `problems.ts` rather than silently overwriting, and reloading tab B lets the edit succeed.

- [ ] **Step 7: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "Catalogue editing, with the default flip confirmed and no invented count"
```

---

### Task 8: The gym Features tab

Implements **D3**, **D5**, **D6**, **D9**.

**Files:**

- Create: `src/features/feature-flags/gym-features-tab.tsx`
- Create: `tests/unit/gym-features-tab.test.tsx`
- Modify: `src/app/(admin)/gyms/[gymId]/page.tsx`

**Interfaces:**

- Consumes: `gyms.features`, `gyms.setFeatures` (Task 3), `overrideAge` (Task 4), `SourceBadge`, `FeatureGroupList` (Task 5)
- Produces:
  - `GymFeaturesList({ features, canManage, now, onSubmit }): React.ReactElement` — presentational, where `onSubmit: (changes: GymFeatureRequest[]) => void`
  - `GymFeaturesTab({ gymId, canManage }): React.ReactElement` — the query container

The split is what makes this testable without mocking a query hook, and `now` is injected for the same reason: an age assertion against the real clock passes today and fails in ninety days.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/gym-features-tab.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GymFeaturesList } from '@/features/feature-flags/gym-features-tab';
import type { ResolvedFeatureDetail } from '@/types/api';

const NOW = new Date('2026-08-13T12:00:00Z');

function resolved(overrides: Partial<ResolvedFeatureDetail> = {}): ResolvedFeatureDetail {
  return {
    featureId: 'f1',
    key: 'crm',
    name: 'CRM',
    category: 'Members',
    enabled: false,
    source: 'Default',
    isPremium: true,
    overrideReason: null,
    overrideSetAtUtc: null,
    overrideSetByEmail: null,
    ...overrides,
  } as ResolvedFeatureDetail;
}

const overridden = resolved({
  enabled: true,
  source: 'Override',
  overrideReason: '90-day goodwill trial',
  overrideSetAtUtc: '2026-08-01T12:00:00Z',
  overrideSetByEmail: 'ops@gymos.test',
});

describe('a gym’s resolved features', () => {
  it('shows the whole catalogue, not only the exceptions', () => {
    // The support question is "is POS on, and why?", which a list of exceptions cannot answer.
    render(
      <GymFeaturesList
        features={[
          resolved({ featureId: 'f1', key: 'crm', name: 'CRM' }),
          resolved({ featureId: 'f2', key: 'pos', name: 'POS', source: 'Plan', enabled: true }),
          resolved({ featureId: 'f3', key: 'gateway', name: 'Gateway', category: 'Integrations' }),
        ]}
        canManage={false}
        now={NOW}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('CRM')).toBeVisible();
    expect(screen.getByText('POS')).toBeVisible();
    expect(screen.getByText('Gateway')).toBeVisible();
  });

  it('names the layer that decided each answer', () => {
    render(
      <GymFeaturesList
        features={[resolved({ source: 'Plan', enabled: true })]}
        canManage={false}
        now={NOW}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Plan')).toBeVisible();
  });

  it('shows an override’s reason, author, age, and that it does not expire', () => {
    render(
      <GymFeaturesList features={[overridden]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText(/90-day goodwill trial/)).toBeVisible();
    expect(screen.getByText(/ops@gymos\.test/)).toBeVisible();
    expect(screen.getByText(/12 days ago/)).toBeVisible();
    expect(screen.getByText(/does not expire/i)).toBeVisible();
  });

  it('asks for a review once a grant is older than the threshold', () => {
    const old = { ...overridden, overrideSetAtUtc: '2026-05-11T12:00:00Z' }; // 94 days

    render(<GymFeaturesList features={[old]} canManage={false} now={NOW} onSubmit={vi.fn()} />);

    expect(screen.getByText(/review/i)).toBeVisible();
  });

  it('renders an override whose author was deleted as (unknown)', () => {
    // SetByUserId is cleared, not the override: the exception survives losing its author.
    const orphaned = { ...overridden, overrideSetByEmail: null };

    render(
      <GymFeaturesList features={[orphaned]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText(/\(unknown\)/)).toBeVisible();
    expect(screen.getByText(/90-day goodwill trial/)).toBeVisible();
  });

  it('refuses to submit a value change with no reason', async () => {
    // Required on every change, because the console cannot tell in advance whether a change
    // creates an exception or withdraws one — that needs the plan's opinion, behind billing.read.
    const onSubmit = vi.fn();
    render(<GymFeaturesList features={[resolved()]} canManage now={NOW} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('switch', { name: /crm/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/reason is required/i)).toBeVisible();
  });

  it('sends only the keys that changed, each with its reason', async () => {
    const onSubmit = vi.fn();
    render(
      <GymFeaturesList
        features={[
          resolved({ featureId: 'f1', key: 'crm', name: 'CRM' }),
          resolved({ featureId: 'f2', key: 'pos', name: 'POS', enabled: true, source: 'Plan' }),
        ]}
        canManage
        now={NOW}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: /crm/i }));
    await userEvent.type(screen.getByLabelText(/reason for crm/i), 'pilot for Q3');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { key: 'crm', isEnabled: true, reason: 'pilot for Q3' },
    ]);
  });

  it('offers no controls without features.manage', () => {
    render(
      <GymFeaturesList features={[resolved()]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});
```

If the toggle primitive in `src/components/ui/` exposes a role other than `switch`, adjust the queries to match it — but keep every assertion.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test gym-features-tab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/feature-flags/gym-features-tab.tsx` exporting **both** `GymFeaturesList` (presentational, what the tests above render) and `GymFeaturesTab` (the container).

`GymFeaturesTab` is thin — it exists only to fetch and to own the mutation:

```tsx
export function GymFeaturesTab({ gymId, canManage }: { gymId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['gym-features', gymId],
    queryFn: ({ signal }) => gyms.features(gymId, signal),
  });

  const save = useMutation({
    mutationFn: (changes: GymFeatureRequest[]) => gyms.setFeatures(gymId, { features: changes }),
    onSuccess: (resolvedAfter) => {
      // Written straight into the cache, unlike the catalogue's invalidate: this response IS the
      // full resolution and carries no counts to be nulled (D11 does not apply here).
      queryClient.setQueryData(['gym-features', gymId], resolvedAfter);
      // The outcome is read back, never predicted — a change that collapsed into the plan's answer
      // comes back as source: Plan with no override, and that is what the operator is told.
      toast.success(
        resolvedAfter
          .filter((f) => changes.some((c) => c.key === f.key))
          .map((f) => `${f.name} is now ${f.enabled ? 'on' : 'off'} (${f.source})`)
          .join(' · '),
      );
    },
    onError: toastApiError,
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ApiErrorText error={query.error} />;

  return (
    <GymFeaturesList
      features={query.data}
      canManage={canManage}
      now={new Date()}
      onSubmit={(changes) => save.mutate(changes)}
    />
  );
}
```

`GymFeaturesList` requirements, all pinned by the tests in Step 1:

- When `source === 'Override'`, additionally render `overrideReason`, the author (`overrideSetByEmail ?? '(unknown)'`), the age from `overrideAge(overrideSetAtUtc, new Date())`, and the text `Does not expire`. When `needsReview`, add a visible review marker explaining that overrides never expire and this one is old.
- Editing (only when `canManage`): each row gets an on/off control and a required reason input. **The reason is required for every change** — the console cannot tell in advance whether a change creates or withdraws an exception, because that needs the plan's opinion and `GET /plans/{id}/features` is behind `billing.read`, which the features vocabulary excludes. Put that reasoning in a comment at the validation.
- Submit sends **only the changed keys**: `gyms.setFeatures(gymId, { features: changed })`.
- On success, write the returned array into the query cache — this response is the full resolution and its counts are not involved, so unlike Task 7 a cache write is correct here. Then toast the outcome read **from the response**, e.g. `crm is now on (Plan)`, never a predicted one.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test gym-features-tab`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the tab**

In `src/app/(admin)/gyms/[gymId]/page.tsx`, add `<TabsTrigger value="features">Features</TabsTrigger>` and its `TabsContent`. **Render the tab only when the gym detail response actually carries a `features` block** — M4.1 made it optional and absent for a caller without `features.read`, so keying off a permission check alone would show a `gyms.read`-only role an empty tab. Pass `canManage={usePermission('features.manage')}`.

- [ ] **Step 6: Prove the withdrawal path by hand**

With the app running: give a gym an override that differs from its plan, confirm `source: Override`; then set it back to the value the plan gives and confirm the row returns to `source: Plan` with no override. This is M4's headline invariant and Task 10 will assert it end to end.

- [ ] **Step 7: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "The gym Features tab: what this gym gets, why, and how old the exception is"
```

---

### Task 9: The plan Features card

Implements **D2**, **D9**, **D10**.

**Files:**

- Create: `src/features/feature-flags/plan-features-card.tsx`
- Create: `tests/unit/plan-features-card.test.tsx`
- Modify: `src/app/(admin)/plans/[planId]/page.tsx`

**Interfaces:**

- Consumes: `plans.features`, `plans.setFeatures` (Task 3), `toRequestValue` / `fromResponseValue` (Task 4), `FeatureGroupList` (Task 5)
- Produces:
  - `interface PlanFeatureRow { key: string; name: string; category: string; state: PlanFeatureState; defaultEnabled: boolean }`
  - `PlanFeaturesList({ rows, canManage, onSubmit }): React.ReactElement` — presentational, where `onSubmit: (changes: PlanFeatureRequest[]) => void`
  - `PlanFeaturesCard({ planId, rowVersion, canManage }): React.ReactElement` — the query container, which joins the plan's contents to the catalogue to build `PlanFeatureRow[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/plan-features-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanFeaturesList, type PlanFeatureRow } from '@/features/feature-flags/plan-features-card';

const rows: PlanFeatureRow[] = [
  { key: 'crm', name: 'CRM', category: 'Members', state: 'default', defaultEnabled: false },
  { key: 'pos', name: 'POS', category: 'Operations', state: 'included', defaultEnabled: true },
];

describe('what a plan includes', () => {
  it('offers three states and marks the current one', () => {
    render(<PlanFeaturesList rows={rows} canManage onSubmit={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Included' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Excluded' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Default' })).toHaveLength(2);

    // CRM is on Default; POS is Included.
    expect(screen.getAllByRole('button', { name: 'Default' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('button', { name: 'Included' })[1]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows what Default resolves to today, so silence shows its consequence', () => {
    render(<PlanFeaturesList rows={rows} canManage onSubmit={vi.fn()} />);

    expect(screen.getByText(/default today: off/i)).toBeVisible();
    expect(screen.getByText(/default today: on/i)).toBeVisible();
  });

  it('sends null for Default — clearing an opinion, not excluding', async () => {
    // `false` and absent look identical to a gym today and answer differently the moment the
    // platform default moves. Sending false here would silently freeze the plan against a future
    // default change.
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Default' })[1]); // POS -> Default
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'pos', isEnabled: null }]);
  });

  it('sends false for Excluded', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Excluded' })[0]); // CRM
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'crm', isEnabled: false }]);
  });

  it('sends only the keys that changed', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Included' })[0]); // CRM only
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'crm', isEnabled: true }]);
  });

  it('does not submit at all when nothing changed — the API refuses an empty list', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is read-only without billing.manage', () => {
    render(<PlanFeaturesList rows={rows} canManage={false} onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Included' })[0]).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test plan-features-card`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/features/feature-flags/plan-features-card.tsx` exporting **three** things, mirroring Task 8's split: the `PlanFeatureRow` interface, `PlanFeaturesList` (presentational, what the Step 1 tests render), and `PlanFeaturesCard` (the container).

`PlanFeaturesList` renders each row as a three-button group carrying `aria-pressed`, with the `Default` button labelled by `Default today: on/off` from `row.defaultEnabled`. It tracks pending state locally, maps through `toRequestValue` on submit, sends **only** the rows whose state changed, and does not call `onSubmit` at all when nothing changed — `PUT /plans/{id}/features` refuses an empty list, so an unchanged form must not reach it. Every control is `disabled` when `canManage` is false, and the save button is absent entirely.

`PlanFeaturesCard` joins two queries to build `PlanFeatureRow[]`: `['plan-features', planId]` for the plan's own opinions, and the shared `['features']` catalogue for each key's `defaultEnabled` and display name. Build the rows from the **catalogue** and look the plan's opinion up per key — driving from the plan's rows instead would silently omit every feature the plan has no opinion about, which is the majority of them and precisely the third state D2 exists to make visible. Map each opinion through `fromResponseValue`. On submit it calls `plans.setFeatures(planId, { features: changed }, rowVersion)`, then invalidates `['plan-features', planId]` and the plan detail query, and reports failure with `toastApiError`.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test plan-features-card`
Expected: PASS.

- [ ] **Step 5: Add the card**

In `src/app/(admin)/plans/[planId]/page.tsx`, add the card beside `Prices`, gated on `usePermission('billing.read')` for display and `billing.manage` for editing. Pass the plan's `rowVersion`, and key the card by it so a save resets it — the pattern the price editor already uses.

- [ ] **Step 6: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "The plan Features card, with silence as a first-class third state"
```

---

### Task 10: The E2E journey

Implements the spec's §6 E2E requirement.

**Files:**

- Create: `tests/e2e/feature-flags-journey.spec.ts`
- Modify: `tests/e2e/README.md` (one line: what the new journey provisions and leaves behind)

**Interfaces:**

- Consumes: the running stack per `tests/e2e/README.md`. **No SQL seed** — the catalogue self-seeds at host startup.

- [ ] **Step 1: Write the journey**

Create `tests/e2e/feature-flags-journey.spec.ts` as a `test.describe.serial` block, following `billing-journey.spec.ts` for fixture-building style and `analytics-journey.spec.ts` for the `visibleText` helper. It must:

1. Sign in.
2. Provision a gym, create a plan, set that plan's feature contents, and assign the subscription. **This setup is mandatory**: `source: Plan` is unreachable for a gym with no live subscription, because such a gym resolves at layer 3 by design.
3. Visit `/features`, assert twelve features under their category headings.
4. Edit one feature's copy and assert it persists.
5. Flip a default, assert the confirmation says it cannot give an exact affected-gym count, confirm, assert the new default.
6. Open the gym's `Features` tab, assert a feature reads `source: Plan`.
7. Grant an override that differs, with a reason; assert `source: Override`, the reason, the author, the age, and `Does not expire`.
8. **Set it back to the value the plan gives; assert the override was withdrawn and the source is `Plan` again.** This is the assertion that matters — it proves M4's headline invariant end to end.
9. On the plan, set one feature `Excluded` and another `Default`, and assert both persist after a reload.

Every nav hop must branch on `isMobile` and open the drawer first.

- [ ] **Step 2: Run it on desktop and watch it pass**

Run: `pnpm exec playwright test feature-flags-journey --project=desktop --reporter=list`
Expected: all steps pass.

- [ ] **Step 3: Run it on mobile**

Run: `pnpm exec playwright test feature-flags-journey --project=mobile --reporter=list`
Expected: all steps pass. A timeout on a nav link means a missing drawer branch — see `ce4fa4b`.

- [ ] **Step 4: Run the whole suite**

Run: `pnpm exec playwright test --reporter=list`
Expected: every spec passes, **zero skips**. The suite was 42/0/0 before F4.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "F4 end to end, including the grant-then-withdraw pair that proves the invariant"
```

---

### Task 11: Close out

**Files:**

- Modify: `GymOS-Backend/docs/STATUS.md`

- [ ] **Step 1: Run every gate one final time**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm exec playwright test --reporter=list
```

Record the exact numbers. Do not round or estimate them.

- [ ] **Step 2: Update STATUS.md**

Add an F4 row to the milestone table and update the "Next step (resume here)" section: F4 built, its review owed, `F4-AS-BUILT.md` deliberately unwritten until that review, per the convention F3 set.

- [ ] **Step 3: Commit and push**

```bash
git add -A && git commit -m "STATUS records F4 as built, review owed"
git push origin development
```

---

## Notes for the executor

- **`F4-AS-BUILT.md` is not part of this plan.** It is written after F4's review, so it records what the review changed. F3's is still unwritten for the same reason.
- **If a task reveals the spec is wrong**, stop and say so rather than implementing around it. The spec is `docs/F4-DESIGN.md`; Features.md outranks it; the running API outranks both.
- **Branch protection does not exist** on this repo (free plan, private repos), so nothing mechanical stops a bad merge to `main`. Work stays on `development`.
