# F5 — Operations console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the console's share of M6 and M7 — `/monitoring` with per-job run history, `/settings` with maintenance mode and a test-email probe, a maintenance banner and 503 notice, and CSV export on `/audit-logs` — so that after F5 the console is complete relative to the backend.

**Architecture:** Four surfaces over nine existing endpoints, one new client capability (`api.download`) and one new client interception (503 `settings.maintenance`). Every screen is a thin TanStack Query container over a presentational component that the unit suite renders directly, the pattern F4 set. Every rule that could rot lives as a pure function under `src/lib/monitoring/` or `src/lib/settings/` (design D10) and is tested without a DOM.

**Tech Stack:** Next.js 16 (see `AGENTS.md` — read `node_modules/next/dist/docs/` before writing route code), React 19, TanStack Query 5, Tailwind v4, the repo's own shadcn-style primitives in `src/components/ui/`, `sonner` toasts, vitest + Testing Library, Playwright.

**Spec:** [`docs/F5-DESIGN.md`](../../F5-DESIGN.md) — read it first. Every task cites the decision (D1–D11) it implements. Where this plan and the spec disagree, the spec wins; where the spec and `GymOS-Backend/docs/BusinessRules/Monitoring.md` or `Settings.md` disagree, those documents win; the running API outranks all three.

## Global Constraints

- **No new runtime dependency** (D11). A new devDependency needs `docs/DEPENDENCY_POLICY.md`'s change process. `Bool` settings render with the existing `Select`, not a switch component.
- **`usePermission` hides UI and never authorises** (F1's standing rule). `monitoring.read`: SuperAdmin, PlatformAdmin, SupportAgent, ReadOnly. `settings.read`: SuperAdmin, PlatformAdmin, ReadOnly. `settings.manage`: **SuperAdmin only**. `audit.export`: SuperAdmin, PlatformAdmin (D9).
- **The console never computes staleness** — `stale` is rendered from the API's flag; a job with `lastRun: null` reads "Has not run yet" and is never stale (D2, Monitoring.md §3).
- **Error text and the outbox `note` are shown exactly as sent** (D2, D3). The backend already bounds them.
- **`PUT /settings` carries only changed keys, never the mask `••••`, `null` to reset, never the Maintenance category** (D6, D7). It takes **no `If-Match`**; a 409 means another administrator saved first.
- **Maintenance mode changes only through `POST /settings/maintenance-mode` with `X-Confirm-Action: maintenance`**, typed by the operator, sent verbatim, judged by the API (D7, AD-6).
- **Export range is inclusive `from ≤ to`, at most 366 days**; the client mirrors the rule and still renders the API's refusal (D8).
- **Copy is British English**, matching the console ("authorise", "recognised", "catalogue").
- **Every E2E nav click needs the `isMobile` drawer branch** — omitting it cost nine silently skipped tests (`ce4fa4b`).
- **Gate before every commit:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. Baseline on 2026-09-20: typecheck clean, 210 unit tests green.
- **Work on `development`.** Branch protection does not exist (free plan); nothing mechanical stops a bad push.

## File structure

| Path | Responsibility |
|---|---|
| `src/types/api.d.ts`, `src/types/api.ts` | Regenerated contract; new aliases (Task 1) |
| `src/lib/api/problems.ts` | New codes; `retryAfterSeconds`; `isMaintenance` (Task 2) |
| `src/lib/api/client.ts` | `api.download`, the 503 interception hook (Task 2) |
| `src/lib/settings/export.ts` | Export range rule, `Content-Disposition` parse, query conversion (Task 2) |
| `src/lib/api/endpoints.ts` | `monitoring`, `settings`, `auditLogs.export` (Task 3) |
| `src/lib/monitoring/format.ts`, `job-state.ts`, `runs.ts` | Duration/uptime formatting, job presentation, run cursor and merge (Task 4) |
| `src/lib/settings/diff.ts`, `values.ts` | `settingsDiff`, fingerprint, per-type validation, bool parse, key label (Task 5) |
| `src/lib/nav/items.ts` | Monitoring and Settings entries (Task 6) |
| `src/features/monitoring/health-rows.tsx` | The health rows, extracted from `HealthPanel` (Task 7) |
| `src/features/monitoring/process-tile.tsx`, `outbox-tile.tsx`, `jobs-table.tsx` | Overview tiles and jobs table (Task 7) |
| `src/app/(admin)/monitoring/page.tsx` | Overview container, polled 60 s (Task 7) |
| `src/features/monitoring/job-runs-list.tsx`, `src/app/(admin)/monitoring/jobs/[name]/page.tsx` | Run history, cursor-paged (Task 8) |
| `src/features/settings/setting-source-badge.tsx`, `settings-category-form.tsx`, `test-email-card.tsx` | Settings rows by type, save, probe (Task 9) |
| `src/app/(admin)/settings/page.tsx` | Tabs container (Task 9, extended in Task 10) |
| `src/features/settings/maintenance-section.tsx`, `maintenance-banner.tsx`, `src/components/feedback/maintenance-notice.tsx`, `src/components/feedback/maintenance-gate.tsx` | Maintenance toggle, banner, 503 notice (Task 10) |
| `src/features/audit/export-dialog.tsx`, `src/lib/utils/download.ts`, `src/app/(admin)/audit-logs/page.tsx` | Export CSV (Task 11) |
| `tests/e2e/operations-journey.spec.ts`, `tests/e2e/seed-support-agent.sql`, `tests/e2e/global-setup.ts`, `tests/e2e/README.md` | End to end (Task 12) |
| `GymOS-Backend/docs/STATUS.md` | Close out (Task 13) |

---

### Task 1: Regenerate the API types and re-export the M6/M7 schemas

Implements the spec's §2 prerequisite. `src/types/api.d.ts` has **zero** occurrences of `monitoring` or `SettingView` today (4,965 lines); the design measured 636 lines of drift. The diff is **read**, not accepted.

**Files:**

- Modify: `src/types/api.d.ts` (by command, never by hand)
- Modify: `src/types/api.ts`

**Interfaces:**

- Produces, all from `@/types/api`: `MonitoringOverview`, `JobStateDto`, `JobRunDto`, `JobRunsPage`, `OutboxDepth`, `ProcessMetrics`, `SettingView`, `SettingValueWrite`, `UpdateSettingsRequest`, `SetMaintenanceModeRequest`, `SmtpConnectionTestResult`; the constants `JOB_RUN_STATUSES`, `SETTING_CATEGORIES`, `SETTING_MASK`; the types `JobRunStatus`, `SettingCategory`.

- [ ] **Step 1: Record the baseline**

```bash
cd /c/Work/Personal-Projects/GymOS/GymOS-Platform
git rev-parse --short HEAD
wc -l src/types/api.d.ts
grep -c monitoring src/types/api.d.ts   # expect 0
```

- [ ] **Step 2: Regenerate**

```bash
pnpm gen:api
git diff --stat src/types/api.d.ts
```

- [ ] **Step 3: Read the diff and account for every change**

```bash
git diff src/types/api.d.ts | grep '^[+-]' | grep -v '^[+-][+-]' | grep -o '"/api/v1/[^"]*"' | sort -u
git diff src/types/api.d.ts | grep -n 'entityType'
```

Expected: changes fall into exactly **four** groups — (a) the three `/monitoring/*` paths and their schemas (`MonitoringOverview`, `JobStateDto`, `JobRunDto`, `JobRunsPage`, `OutboxDepth`, `ProcessMetrics`, `DashboardHealth` reused); (b) the four `/settings*` paths and their schemas (`SettingView`, `SettingValueWrite`, `UpdateSettingsRequest`, `SetMaintenanceModeRequest`, `SmtpConnectionTestResult`); (c) `/audit-logs/export`; (d) `ActivityEntry.entityType` becoming `string | null` (H1). **A fifth group means stop and report it** before proceeding. `describeEntityType` in `src/lib/utils/audit.ts` already accepts `string | null | undefined`, so (d) needs no code change — confirm with `pnpm typecheck` in Step 5.

- [ ] **Step 4: Re-export the schemas**

Append to `src/types/api.ts` after the `ChurnPoint` line:

```ts
export type MonitoringOverview = Schemas['MonitoringOverview'];
export type JobStateDto = Schemas['JobStateDto'];
export type JobRunDto = Schemas['JobRunDto'];
export type JobRunsPage = Schemas['JobRunsPage'];
export type OutboxDepth = Schemas['OutboxDepth'];
export type ProcessMetrics = Schemas['ProcessMetrics'];

/**
 * A run's status by name, as the API reports it and as `/monitoring/jobs/{name}/runs?status=`
 * accepts it (parsed case-insensitively server-side — Monitoring.md §7).
 */
export const JOB_RUN_STATUSES = ['Running', 'Succeeded', 'Failed'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export type SettingView = Schemas['SettingView'];
export type SettingValueWrite = Schemas['SettingValueWrite'];
export type UpdateSettingsRequest = Schemas['UpdateSettingsRequest'];
export type SetMaintenanceModeRequest = Schemas['SetMaintenanceModeRequest'];
export type SmtpConnectionTestResult = Schemas['SmtpConnectionTestResult'];

/**
 * The five categories `PlatformSettingDefinitions.All` declares (Settings.md §1). Maintenance is
 * listed because `GET /settings?category=Maintenance` is how the banner reads it — but it is never
 * a tab and never sent to `PUT /settings`, which refuses it (D7).
 */
export const SETTING_CATEGORIES = ['General', 'Email', 'Security', 'Maintenance', 'Retention'] as const;
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

/**
 * What a sensitive value reads as once a row exists, and what a PUT would send to mean
 * "unchanged" — which this console never does: an unchanged row is simply not sent (D6).
 * `PlatformSettingDefinitions.Mask`, byte for byte.
 */
export const SETTING_MASK = '••••';
```

- [ ] **Step 5: Verify it compiles**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/types/api.d.ts src/types/api.ts
git commit -m "Regenerate API types for F5, and read the diff

Monitoring, settings, the audit export, and H1's nullable entityType —
four groups, all accounted for; no fifth present. describeEntityType
already tolerated null, so the H1 change needs no console code."
```

---

### Task 2: The client learns to download, to read Retry-After, and to recognise maintenance

Implements **D7** (503 interception) and **D8** (`api.download`, filename parse, range rule). The client is the one place these can live so no screen can opt out by accident.

**Files:**

- Modify: `src/lib/api/problems.ts`
- Modify: `src/lib/api/client.ts`
- Create: `src/lib/settings/export.ts`
- Test: `tests/unit/client.test.ts` (extend), `tests/unit/problems.test.ts` (extend), create `tests/unit/settings-export.test.ts`

**Interfaces:**

- Produces:
  - `ApiError.retryAfterSeconds: number | null` (5th constructor argument, default `null`)
  - `ApiError.isMaintenance: boolean` — `status === 503 && code === 'settings.maintenance'`
  - `onMaintenanceSet(handler: ((error: ApiError) => void) | null): void` from `@/lib/api/client`
  - `interface DownloadedFile { blob: Blob; filename: string | null }`
  - `api.download(path: string, signal?: AbortSignal): Promise<DownloadedFile>`
  - From `@/lib/settings/export`: `MAX_EXPORT_RANGE_DAYS = 366`, `defaultExportRange(today: Date): DateRange`, `explainInvalidExportRange(range: DateRange): string | null`, `exportRangeToQuery(range: DateRange): { from: string; to: string }`, `parseContentDispositionFilename(header: string | null): string | null`
  - New `MESSAGES` entries: `settings.confirmation_required`, `settings.confirmation_mismatch`, `settings.use_maintenance_endpoint`, `audit.export_range`, `monitoring.job_not_found`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/problems.test.ts` (read the file first and match its import style):

```ts
describe('maintenance and rate-limit metadata (F5 D7)', () => {
  it('recognises the maintenance short-circuit by code and status, not by title', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'settings.maintenance',
        title: 'Maintenance in progress',
        detail: 'Back at 03:00 UTC.',
        code: 'settings.maintenance',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '300' },
      },
    );

    const error = await parseProblem(response);

    expect(error.isMaintenance).toBe(true);
    expect(error.retryAfterSeconds).toBe(300);
    // No mapped sentence for this code on purpose: `detail` IS the operator's own message.
    expect(error.message).toBe('Back at 03:00 UTC.');
  });

  it('a 503 without the code is an outage, not maintenance', async () => {
    const response = new Response('<html>bad gateway</html>', { status: 503 });

    const error = await parseProblem(response);

    expect(error.isMaintenance).toBe(false);
    expect(error.retryAfterSeconds).toBeNull();
  });

  it('ignores a Retry-After that is not a whole number of seconds', async () => {
    // RFC 7231 also allows an HTTP-date; this backend never sends one, and a date parsed as a
    // number would be NaN minutes on screen.
    const response = new Response(JSON.stringify({ code: 'security.rate_limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/problem+json', 'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    });

    expect((await parseProblem(response)).retryAfterSeconds).toBeNull();
  });
});
```

Append to `tests/unit/client.test.ts` (it already has `fetchMock`, `jsonResponse`, `problemResponse`, `headersOfCall`, and imports from `@/lib/api/client` — add `onMaintenanceSet` to that import):

```ts
describe('maintenance interception (F5 D7)', () => {
  it('hands a 503 settings.maintenance to the registered handler and still rejects', async () => {
    setAccessToken('token');
    const blocked = vi.fn();
    onMaintenanceSet(blocked);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ code: 'settings.maintenance', detail: 'Down for an hour.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '300' },
        },
      ),
    );

    await expect(api.get('/gyms')).rejects.toBeInstanceOf(ApiError);

    expect(blocked).toHaveBeenCalledTimes(1);
    const [error] = blocked.mock.calls[0]!;
    expect((error as ApiError).isMaintenance).toBe(true);
    expect((error as ApiError).retryAfterSeconds).toBe(300);
  });

  it('does not treat any other failure as maintenance', async () => {
    setAccessToken('token');
    const blocked = vi.fn();
    onMaintenanceSet(blocked);
    fetchMock.mockResolvedValue(problemResponse(503, 'server.invariant_violation'));

    await expect(api.get('/gyms')).rejects.toBeInstanceOf(ApiError);

    expect(blocked).not.toHaveBeenCalled();
  });
});

describe('api.download (F5 D8)', () => {
  it('sends the bearer token and returns the body as a Blob with the attachment filename', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValueOnce(
      new Response('id,created_at_utc\r\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition':
            "attachment; filename=audit-logs-20260821-20260920.csv; filename*=UTF-8''audit-logs-20260821-20260920.csv",
        },
      }),
    );

    const file = await api.download('/audit-logs/export?from=a&to=b');

    expect(headersOfCall(0)['Authorization']).toBe('Bearer token');
    expect(file.filename).toBe('audit-logs-20260821-20260920.csv');
    expect(await file.blob.text()).toBe('id,created_at_utc\r\n');
  });

  it('parses a refusal into the same ApiError every other call produces', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValueOnce(problemResponse(400, 'audit.export_range'));

    const failure = await api.download('/audit-logs/export').then(
      () => null,
      (error: unknown) => error,
    );

    expect((failure as ApiError).code).toBe('audit.export_range');
  });

  it('retries once after a refresh, like any other request', async () => {
    setAccessToken('stale');
    fetchMock
      .mockResolvedValueOnce(problemResponse(401, 'auth.session_expired'))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(new Response('x', { status: 200 }));

    const file = await api.download('/audit-logs/export');

    expect(await file.blob.text()).toBe('x');
    expect(file.filename).toBeNull();
  });
});
```

Create `tests/unit/settings-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  MAX_EXPORT_RANGE_DAYS,
  defaultExportRange,
  explainInvalidExportRange,
  exportRangeToQuery,
  parseContentDispositionFilename,
} from '@/lib/settings/export';

const today = new Date('2026-09-20T10:00:00Z');

describe('the export range (D8)', () => {
  it('defaults to the last 30 days ending today', () => {
    expect(defaultExportRange(today)).toEqual({ from: '2026-08-22', to: '2026-09-20' });
  });

  it('accepts a range of exactly the maximum', () => {
    expect(explainInvalidExportRange({ from: '2025-09-20', to: '2026-09-20' })).toBeNull();
    expect(MAX_EXPORT_RANGE_DAYS).toBe(366);
  });

  it('refuses an inverted range with the sentence the API uses', () => {
    expect(explainInvalidExportRange({ from: '2026-09-21', to: '2026-09-20' })).toMatch(
      /start.*on or before.*end/i,
    );
  });

  it('refuses a range past the maximum, naming the limit', () => {
    expect(explainInvalidExportRange({ from: '2025-09-19', to: '2026-09-20' })).toMatch(/366/);
  });

  it('asks for both dates when one is missing', () => {
    expect(explainInvalidExportRange({ from: '', to: '2026-09-20' })).toMatch(/both dates/i);
  });

  it('sends whole UTC days: midnight at the start, the last second at the end', () => {
    // `to` is inclusive server-side and the span check is `to - from > 366 days`, so a `to` of
    // 23:59:59 on the last day keeps a 366-day inclusive range strictly under the limit.
    expect(exportRangeToQuery({ from: '2026-08-22', to: '2026-09-20' })).toEqual({
      from: '2026-08-22T00:00:00Z',
      to: '2026-09-20T23:59:59Z',
    });
  });
});

describe('parseContentDispositionFilename', () => {
  it('prefers the RFC 5987 filename* form, decoded', () => {
    expect(
      parseContentDispositionFilename(
        "attachment; filename=fallback.csv; filename*=UTF-8''audit%20logs.csv",
      ),
    ).toBe('audit logs.csv');
  });

  it('falls back to a quoted or bare filename', () => {
    expect(parseContentDispositionFilename('attachment; filename="a.csv"')).toBe('a.csv');
    expect(parseContentDispositionFilename('attachment; filename=a.csv')).toBe('a.csv');
  });

  it('returns null when there is no header or no filename in it', () => {
    expect(parseContentDispositionFilename(null)).toBeNull();
    expect(parseContentDispositionFilename('inline')).toBeNull();
  });

  it('strips any path a hostile header might carry', () => {
    // The browser treats the name as a suggestion, but a "../" in it should not even be suggested.
    expect(parseContentDispositionFilename('attachment; filename="../../etc/passwd"')).toBe(
      'passwd',
    );
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test problems client settings-export`
Expected: FAIL — `isMaintenance`/`retryAfterSeconds` undefined, `onMaintenanceSet`/`api.download` not exported, `@/lib/settings/export` not found.

- [ ] **Step 3: Extend `problems.ts`**

In `src/lib/api/problems.ts`, add to `MESSAGES` (a new block after the Features block):

```ts
  // Settings and maintenance (F5-DESIGN D7; Settings.md §7, §10)
  'settings.confirmation_required': 'Type maintenance to confirm.',
  'settings.confirmation_mismatch': 'That did not match. Type maintenance to confirm. Nothing was changed.',
  // Unreachable from this console — the Maintenance category is never sent to PUT /settings — but
  // mapped so an unexpected arrival reads as a sentence rather than a route.
  'settings.use_maintenance_endpoint':
    'Maintenance mode changes only through its own confirmed control, not with the other settings.',
  // `settings.email_disabled`, `settings.invalid_value` and `settings.invalid_state` are deliberately
  // NOT mapped: the API's own detail names the key and the rule, and that is what the operator needs.
  // `settings.maintenance` is not mapped either — its detail is the maintenance message itself.

  // Audit export (F5-DESIGN D8; Settings.md §9). The client-side range rule reuses this sentence.
  'audit.export_range':
    'Choose a range whose start is on or before its end and that covers at most 366 days.',

  // Monitoring (Monitoring.md §7)
  'monitoring.job_not_found': 'That job is not registered and has no run history.',
```

Change the `ApiError` constructor and add the getter:

```ts
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly detail: string | undefined,
    readonly retryable: boolean,
    /** From `Retry-After`, in whole seconds; null when absent or not a plain number. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(messageFor(code, detail, status));
    this.name = 'ApiError';
  }

  /**
   * The maintenance middleware's short-circuit (Settings.md §7): everyone without `settings.manage`
   * meets this on every non-exempt route while maintenance is on. Recognised by status AND code —
   * a 503 from a proxy in front of a dead API carries neither the code nor the meaning.
   */
  get isMaintenance(): boolean {
    return this.status === 503 && this.code === 'settings.maintenance';
  }
  // ...existing getters unchanged
```

In `parseProblem`, read the header and pass it:

```ts
  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterSeconds =
    retryAfterHeader !== null && /^\d+$/.test(retryAfterHeader.trim())
      ? Number(retryAfterHeader.trim())
      : null;

  return new ApiError(response.status, code, detail, retryable, retryAfterSeconds);
```

Also update the stale comment on `isRateLimited` to say `see retryAfterSeconds`.

- [ ] **Step 4: Create `src/lib/settings/export.ts`**

```ts
import { messageFor } from '@/lib/api/problems';
import { spanInDays, toIsoDate, type DateRange } from '@/lib/analytics/range';

/**
 * The rules around `GET /audit-logs/export` that the console mirrors before asking (F5-DESIGN D8).
 *
 * Mirroring is not trusting: the dialog blocks the common mistakes so they never become a round
 * trip, and the API's own `audit.export_range` refusal still renders like any other error if a
 * request slips past — the same stance F3's `RangeControl` takes.
 */

/** `AuditCsv.MaxRangeDays` — 366, inclusive of both ends, a full year including a leap day. */
export const MAX_EXPORT_RANGE_DAYS = 366;

export type { DateRange };

const MS_PER_DAY = 86_400_000;

/** The last 30 days ending today, in UTC — the same default the analytics screens open on. */
export function defaultExportRange(today: Date): DateRange {
  return {
    from: toIsoDate(new Date(today.getTime() - 29 * MS_PER_DAY)),
    to: toIsoDate(today),
  };
}

/**
 * Why the API would refuse this range, or `null` if it would not.
 *
 * The over-limit and inverted cases return the sentence mapped for `audit.export_range`, so the
 * operator reads the same words whether the dialog or the API is the one refusing.
 */
export function explainInvalidExportRange(range: DateRange): string | null {
  const span = spanInDays(range);

  if (!Number.isFinite(span)) {
    return 'Enter both dates.';
  }

  if (span < 1 || span > MAX_EXPORT_RANGE_DAYS) {
    return messageFor('audit.export_range', undefined, 400);
  }

  return null;
}

/**
 * Whole UTC days, as `date-time` values. `to` ends at 23:59:59 rather than midnight of the next
 * day: the API's check is `to - from > 366 days`, and a 366-day inclusive range sent as two midnights
 * would measure exactly 366 days and pass — but the same range with `to` at midnight would exclude
 * the last day's entries entirely. The last second keeps the day and stays under the limit.
 */
export function exportRangeToQuery(range: DateRange): { from: string; to: string } {
  return { from: `${range.from}T00:00:00Z`, to: `${range.to}T23:59:59Z` };
}

/**
 * The filename an attachment asks for. ASP.NET's `Results.Stream(..., fileDownloadName)` sends both
 * `filename=` and `filename*=UTF-8''…`; the starred form is preferred because it is the one that
 * survives non-ASCII. Any directory part is stripped — the browser would too, but a suggestion the
 * console makes should already be sane.
 */
export function parseContentDispositionFilename(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const starred = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header);

  let name: string | null = null;

  if (starred?.[1]) {
    try {
      name = decodeURIComponent(starred[1].trim());
    } catch {
      name = null;
    }
  }

  if (!name && plain) {
    name = (plain[1] ?? plain[2] ?? '').trim();
  }

  if (!name) {
    return null;
  }

  const leaf = name.split(/[\\/]/).pop() ?? '';

  return leaf.length > 0 ? leaf : null;
}
```

- [ ] **Step 5: Extend `client.ts`**

Add beside `onSessionLost`:

```ts
/**
 * Called when the API refuses a request with 503 `settings.maintenance` (Settings.md §7). Only a
 * caller without `settings.manage` ever sees this, so for them the whole console is closed — the
 * app renders a full-page notice (F5-DESIGN D7) rather than letting each screen toast the same thing.
 */
let onMaintenance: ((error: ApiError) => void) | null = null;

export function onMaintenanceSet(handler: ((error: ApiError) => void) | null): void {
  onMaintenance = handler;
}
```

Replace the failure branch of `request()` with a shared helper, and add `download`:

```ts
/**
 * Turns a non-2xx response into the ApiError every caller sees, and fires the two interceptions that
 * are the app's business rather than any one screen's.
 */
async function rejectWith(path: string, options: RequestOptions, response: Response): Promise<never> {
  const problem = await parseProblem(response);

  if (problem.isPreconditionDefect) {
    // The operator cannot fix this and did not cause it. Loud in the console, generic on screen.
    console.error(
      `[api] ${options.method ?? 'GET'} ${path} was sent without a usable If-Match (${problem.code}). ` +
        'A write reached the API without reading first — see lib/api/client.ts.',
    );
  }

  if (problem.isMaintenance) {
    onMaintenance?.(problem);
  }

  throw problem;
}

async function dispatch(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await send(path, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    // Network-level failure: no status, no problem document.
    throw new ApiError(0, undefined, undefined, true);
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await dispatch(path, options);

  if (!response.ok) {
    return rejectWith(path, options, response);
  }

  rememberEtag(path, response.headers.get('ETag'));

  if (response.status === 204) {
    return (options.readHeader ? response.headers.get(options.readHeader) : undefined) as T;
  }

  return (await response.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  /** From `Content-Disposition`, or null when the server named nothing. */
  filename: string | null;
}

/**
 * A GET whose answer is a file, not JSON (`GET /audit-logs/export`).
 *
 * Goes through `send` so it carries the bearer token, retries once after a refresh and parses a
 * refusal exactly like every other call — an `<a href>` to the API would do none of those, because
 * the token lives in memory and never in a cookie (F1 D3).
 */
async function download(path: string, signal?: AbortSignal): Promise<DownloadedFile> {
  const options: RequestOptions = { signal };
  const response = await dispatch(path, options);

  if (!response.ok) {
    return rejectWith(path, options, response);
  }

  return {
    blob: await response.blob(),
    filename: parseContentDispositionFilename(response.headers.get('Content-Disposition')),
  };
}
```

Add `download` to the exported `api` object and import `parseContentDispositionFilename` from `@/lib/settings/export`. Reset `onMaintenance = null` inside `__resetClientState`.

- [ ] **Step 6: Run them and watch them pass**

Run: `pnpm test problems client settings-export`
Expected: PASS. Then `pnpm test` — every earlier test still green (the constructor's new argument has a default, so the four existing `new ApiError(...)` calls compile unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/lib/api src/lib/settings/export.ts tests/unit
git commit -m "The client can download a file, read Retry-After, and recognise maintenance

api.download carries the bearer token and the refresh retry an <a href>
never could. A 503 settings.maintenance is handed to one app-level
handler rather than toasted by every screen that meets it."
```

---

### Task 3: The endpoint functions

Implements **D7** (where the confirmation header goes) and the wiring for every surface.

**Files:**

- Modify: `src/lib/api/endpoints.ts`
- Test: `tests/unit/endpoints.test.ts` (extend)

**Interfaces:**

- Consumes: `api`, `query` from `@/lib/api/client`; the Task 1 types.
- Produces:
  - `monitoring.overview(signal?): Promise<MonitoringOverview>`
  - `monitoring.jobs(signal?): Promise<JobStateDto[]>`
  - `monitoring.runs(name: string, params?: { from?: string; to?: string; status?: JobRunStatus; limit?: number }, signal?): Promise<JobRunsPage>`
  - `settings.list(category?: SettingCategory, signal?): Promise<SettingView[]>`
  - `settings.update(body: UpdateSettingsRequest): Promise<SettingView[]>`
  - `settings.testEmail(): Promise<SmtpConnectionTestResult>`
  - `settings.setMaintenanceMode(body: SetMaintenanceModeRequest, confirmation: string): Promise<SettingView[]>`
  - `auditLogs.export(params: { from: string; to: string; action?: string; entityType?: string; entityId?: string; userId?: string }, signal?): Promise<DownloadedFile>`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/endpoints.test.ts` (add `auditLogs`, `monitoring`, `settings` to its import from `@/lib/api/endpoints`):

```ts
describe('monitoring endpoints', () => {
  it('encodes the job name and drops empty run filters', async () => {
    fetchMock.mockResolvedValueOnce(ok({ runs: [], hasMore: false }));

    await monitoring.runs('subscription-renewal', { status: 'Failed', to: undefined, limit: 50 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/v1/monitoring/jobs/subscription-renewal/runs?status=Failed&limit=50',
    );
  });

  it('reads the overview with no query string', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));

    await monitoring.overview();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/monitoring/overview');
  });
});

describe('settings endpoints', () => {
  it('narrows a read to one category, and reads everything when none is given', async () => {
    fetchMock.mockResolvedValue(ok([]));

    await settings.list('Maintenance');
    await settings.list();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings?category=Maintenance');
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/v1/settings');
  });

  it('PUTs a category batch with NO If-Match — the endpoint takes none (Settings.md §5)', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await settings.update({ category: 'General', values: [{ key: 'general.platform_name', value: 'X' }] });

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(headersOf(0)['If-Match']).toBeUndefined();
  });

  it('sends what the operator typed as X-Confirm-Action on the maintenance toggle', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await settings.setMaintenanceMode({ enabled: true, message: 'Back soon.' }, 'maintenance');

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings/maintenance-mode');
    expect(headersOf(0)['X-Confirm-Action']).toBe('maintenance');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ enabled: true, message: 'Back soon.' }),
    );
  });

  it('posts the email probe with no body', async () => {
    fetchMock.mockResolvedValueOnce(ok({ ok: false, stage: 'Connect', server: null, error: 'refused' }));

    await settings.testEmail();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings/test-email');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
});

describe('auditLogs.export', () => {
  it('builds the export path with the range and the current filter', async () => {
    fetchMock.mockResolvedValueOnce(new Response('id\r\n', { status: 200 }));

    await auditLogs.export({ from: '2026-08-22T00:00:00Z', to: '2026-09-20T23:59:59Z', action: 'gym.' });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/v1/audit-logs/export?from=2026-08-22T00%3A00%3A00Z&to=2026-09-20T23%3A59%3A59Z&action=gym.',
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test endpoints`
Expected: FAIL — `monitoring` and `settings` are not exported; `auditLogs.export` is not a function.

- [ ] **Step 3: Implement**

Add the new types to the import at the top of `src/lib/api/endpoints.ts`: `JobRunStatus`, `JobRunsPage`, `JobStateDto`, `MonitoringOverview`, `SetMaintenanceModeRequest`, `SettingCategory`, `SettingView`, `SmtpConnectionTestResult`, `UpdateSettingsRequest`.

Extend `auditLogs`:

```ts
  /**
   * The trail as a file. `from` and `to` are required `date-time`s at most 366 days apart
   * (`audit.export_range`); the other filters are the list's own. Behind `audit.export`, which
   * SupportAgent deliberately lacks — reading a screen and walking out with the table are different
   * authorities under GDPR (Settings.md §9). The export is itself recorded as `audit.exported`.
   */
  export: (
    params: {
      from: string;
      to: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      userId?: string;
    },
    signal?: AbortSignal,
  ) => api.download(`/audit-logs/export${query({ ...params })}`, signal),
```

Add after `analytics`:

```ts
/**
 * Is the platform healthy right now, and did last night's job actually run (Monitoring.md).
 *
 * Behind `monitoring.read`, which SupportAgent holds and BillingAdmin does not — the opposite shape
 * from `analytics.read`, and safe because a run's `error` is bounded to type and message (§2).
 * `stale` arrives computed; the console never derives it (F5-DESIGN D2).
 */
export const monitoring = {
  overview: (signal?: AbortSignal) => api.get<MonitoringOverview>('/monitoring/overview', signal),

  jobs: (signal?: AbortSignal) => api.get<JobStateDto[]>('/monitoring/jobs', signal),

  /**
   * Newest first, paged by time: `hasMore` means older runs exist, and the next page is fetched by
   * moving `to` to the oldest `startedAtUtc` received (§7). `limit` defaults to 50 and is clamped
   * to 200 server-side. The name is encoded because a job name is a path segment we did not choose.
   */
  runs: (
    name: string,
    params: { from?: string; to?: string; status?: JobRunStatus; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    api.get<JobRunsPage>(
      `/monitoring/jobs/${encodeURIComponent(name)}/runs${query({ ...params })}`,
      signal,
    ),
};

/**
 * The declared settings catalogue and each key's effective value (Settings.md).
 *
 * `list` is `settings.read`; everything else is `settings.manage`, SuperAdmin only. A sensitive
 * key's value comes back as `••••` once a row exists; the console never sends the mask back — an
 * untouched row is simply absent from the batch (F5-DESIGN D6).
 */
export const settings = {
  list: (category?: SettingCategory, signal?: AbortSignal) =>
    api.get<SettingView[]>(`/settings${query({ category })}`, signal),

  /**
   * One category, only the keys that changed, all-or-nothing. **No `If-Match`**: the endpoint takes
   * none, so two administrators editing in sequence are last-write-wins and only a genuine race
   * surfaces as 409 (§5). Returns the category's fresh views.
   */
  update: (body: UpdateSettingsRequest) => api.put<SettingView[]>('/settings', body),

  /** Connects, authenticates, NOOPs, disconnects — sends nothing (§6, ADR-53). */
  testEmail: () => api.post<SmtpConnectionTestResult>('/settings/test-email'),

  /**
   * `confirmation` is the literal word `maintenance`, typed by the operator and sent verbatim as
   * `X-Confirm-Action` — the API judges it (AD-6). Prefilling it would confirm nothing.
   */
  setMaintenanceMode: (body: SetMaintenanceModeRequest, confirmation: string) =>
    api.post<SettingView[]>('/settings/maintenance-mode', body, { confirmation }),
};
```

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test endpoints`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/endpoints.ts tests/unit/endpoints.test.ts
git commit -m "Add the monitoring, settings and audit-export endpoint functions"
```

---

### Task 4: The monitoring rules, as pure functions

Implements **D2** (state presentation from the API's flag), **D4** (run cursor) and the formatting D10 lists. These are the rules that rot silently, so they live outside React.

**Files:**

- Create: `src/lib/monitoring/format.ts`
- Create: `src/lib/monitoring/job-state.ts`
- Create: `src/lib/monitoring/runs.ts`
- Create: `tests/unit/monitoring-format.test.ts`, `tests/unit/job-state.test.ts`, `tests/unit/monitoring-runs.test.ts`

**Interfaces:**

- Produces:
  - `formatDuration(ms: number | string | null | undefined): string` — `'—'`, `'420 ms'`, `'12.3 s'`, `'3 min 12 s'`, `'1 h 3 min'`
  - `formatSeconds(seconds: number | string | null | undefined): string` — `'—'`, `'45 s'`, `'12 min'`, `'3 h 12 min'`, `'2 d 3 h'` (uptime and outbox age)
  - `formatCpu(percent: number | string | null | undefined): string | null` — `'4.2%'`, or `null` when there is no sample yet
  - `formatMegabytes(mb: number | string): string` — `'312 MB'`
  - `type JobTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'`
  - `interface JobPresentation { label: string; tone: JobTone }`
  - `presentJobState(job: JobStateDto): JobPresentation`
  - `nextRunsCursor(page: JobRunsPage): string | undefined`
  - `mergeRunPages(pages: readonly JobRunsPage[]): JobRunDto[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/monitoring-format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCpu, formatDuration, formatMegabytes, formatSeconds } from '@/lib/monitoring/format';

describe('formatDuration', () => {
  it('renders a missing duration as a dash, not zero', () => {
    // A Running row has no duration yet; "0 ms" would say it finished instantly.
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
  });

  it('picks the unit by magnitude and accepts the contract’s string form', () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration('12345')).toBe('12.3 s');
    expect(formatDuration(192_000)).toBe('3 min 12 s');
    expect(formatDuration(3_780_000)).toBe('1 h 3 min');
  });
});

describe('formatSeconds', () => {
  it('scales from seconds to days', () => {
    expect(formatSeconds(45)).toBe('45 s');
    expect(formatSeconds(720)).toBe('12 min');
    expect(formatSeconds(11_520)).toBe('3 h 12 min');
    expect(formatSeconds('183600')).toBe('2 d 3 h');
    expect(formatSeconds(null)).toBe('—');
  });
});

describe('formatCpu and formatMegabytes', () => {
  it('returns null for a CPU figure the sampler has not produced yet', () => {
    // The first reading after start-up is null because a delta needs two samples (Monitoring.md §6).
    expect(formatCpu(null)).toBeNull();
    expect(formatCpu('4.25')).toBe('4.3%');
    expect(formatCpu(0)).toBe('0.0%');
  });

  it('labels memory in the unit the API uses', () => {
    expect(formatMegabytes(312)).toBe('312 MB');
    expect(formatMegabytes('1024')).toBe('1,024 MB');
  });
});
```

Create `tests/unit/job-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { presentJobState } from '@/lib/monitoring/job-state';
import type { JobRunDto, JobStateDto } from '@/types/api';

function run(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 'r1',
    jobName: 'retention',
    instance: 'api-1',
    status: 'Succeeded',
    startedAtUtc: '2026-09-20T02:00:00Z',
    finishedAtUtc: '2026-09-20T02:00:04Z',
    durationMs: 4000,
    error: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobStateDto> = {}): JobStateDto {
  return {
    name: 'retention',
    schedule: 'daily at 02:00 UTC',
    lastRun: run(),
    lastSucceededAtUtc: '2026-09-20T02:00:00Z',
    nextDueUtc: '2026-09-21T02:00:00Z',
    stale: false,
    ...overrides,
  };
}

describe('presentJobState (D2)', () => {
  it('says a job with no history has not run yet — and never calls it stale', () => {
    expect(presentJobState(job({ lastRun: null, lastSucceededAtUtc: null }))).toEqual({
      label: 'Has not run yet',
      tone: 'neutral',
    });
  });

  it('renders the API’s stale flag, never its own arithmetic', () => {
    // A run four seconds old is "stale" if the API says so: the rule (period, grace, never-succeeded)
    // lives in JobStateAssembler, and a second copy here would drift from it.
    expect(presentJobState(job({ stale: true })).label).toBe('Stale');
    expect(presentJobState(job({ stale: true })).tone).toBe('danger');
  });

  it('shows a run still in progress', () => {
    const state = presentJobState(
      job({ lastRun: run({ status: 'Running', finishedAtUtc: null, durationMs: null }) }),
    );

    expect(state).toEqual({ label: 'Running', tone: 'info' });
  });

  it('names a failed last run that the API does not yet call stale', () => {
    // Possible only for a job that has succeeded before within two periods (Monitoring.md §3 rule 3):
    // "the last run failed" is true and worth saying without pretending to know more.
    const state = presentJobState(
      job({ lastRun: run({ status: 'Failed', error: 'SqlException: x' }) }),
    );

    expect(state).toEqual({ label: 'Last run failed', tone: 'warning' });
  });

  it('is healthy otherwise', () => {
    expect(presentJobState(job())).toEqual({ label: 'Healthy', tone: 'success' });
  });
});
```

Create `tests/unit/monitoring-runs.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeRunPages, nextRunsCursor } from '@/lib/monitoring/runs';
import type { JobRunDto, JobRunsPage } from '@/types/api';

function run(id: string, startedAtUtc: string): JobRunDto {
  return {
    id,
    jobName: 'retention',
    instance: 'api-1',
    status: 'Succeeded',
    startedAtUtc,
    finishedAtUtc: startedAtUtc,
    durationMs: 1,
    error: null,
  };
}

describe('nextRunsCursor (D4)', () => {
  it('is the oldest startedAtUtc on the page when older runs exist', () => {
    const page: JobRunsPage = {
      runs: [run('a', '2026-09-20T02:00:00Z'), run('b', '2026-09-19T02:00:00Z')],
      hasMore: true,
    };

    expect(nextRunsCursor(page)).toBe('2026-09-19T02:00:00Z');
  });

  it('is undefined when the API says nothing older exists, or the page is empty', () => {
    expect(
      nextRunsCursor({ runs: [run('a', '2026-09-20T02:00:00Z')], hasMore: false }),
    ).toBeUndefined();
    expect(nextRunsCursor({ runs: [], hasMore: true })).toBeUndefined();
  });

  it('does not assume the page is sorted', () => {
    const page: JobRunsPage = {
      runs: [run('b', '2026-09-19T02:00:00Z'), run('a', '2026-09-20T02:00:00Z')],
      hasMore: true,
    };

    expect(nextRunsCursor(page)).toBe('2026-09-19T02:00:00Z');
  });
});

describe('mergeRunPages', () => {
  it('drops the run the inclusive cursor returns twice, keeping first-seen order', () => {
    // `to` is inclusive on startedAtUtc (Monitoring.md §7), so the run at the cursor heads the
    // next page as well. Rendering it twice would read as two runs.
    const first: JobRunsPage = {
      runs: [run('a', '2026-09-20T02:00:00Z'), run('b', '2026-09-19T02:00:00Z')],
      hasMore: true,
    };
    const second: JobRunsPage = {
      runs: [run('b', '2026-09-19T02:00:00Z'), run('c', '2026-09-18T02:00:00Z')],
      hasMore: false,
    };

    expect(mergeRunPages([first, second]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test monitoring-format job-state monitoring-runs`
Expected: FAIL — none of the three modules resolves.

- [ ] **Step 3: Implement**

Create `src/lib/monitoring/format.ts`:

```ts
/**
 * Numbers from `/monitoring/*`, as an operator reads them.
 *
 * Every numeric field in the contract is typed `number | string` because the backend's OpenAPI
 * generator declares integers that way (the same reason `Pagination.totalCount` is). Coerced here,
 * once, rather than by hand-editing the generated types — the drift AD-12 forbids.
 */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'string' ? Number(value) : value;

  return Number.isFinite(parsed) ? parsed : null;
}

/** A run's wall time. Null (a run still going, or one the recorder never finished) is a dash. */
export function formatDuration(ms: number | string | null | undefined): string {
  const value = toNumber(ms);

  if (value === null) {
    return '—';
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  if (value < 3_600_000) {
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return `${minutes} min ${seconds} s`;
  }

  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round((value % 3_600_000) / 60_000);
  return `${hours} h ${minutes} min`;
}

/** Uptime and the outbox's oldest-message age, both `int64` seconds on the wire. */
export function formatSeconds(seconds: number | string | null | undefined): string {
  const value = toNumber(seconds);

  if (value === null) {
    return '—';
  }

  if (value < 60) {
    return `${Math.round(value)} s`;
  }

  if (value < 3600) {
    return `${Math.floor(value / 60)} min`;
  }

  if (value < 86_400) {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${hours} h ${minutes} min`;
  }

  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3600);
  return `${days} d ${hours} h`;
}

/**
 * Null until the sampler has two readings (Monitoring.md §6). Returned as null rather than a dash so
 * the tile can say "Warming up" — a dash beside "CPU" reads as a broken metric, not a young process.
 */
export function formatCpu(percent: number | string | null | undefined): string | null {
  const value = toNumber(percent);

  return value === null ? null : `${value.toFixed(1)}%`;
}

export function formatMegabytes(mb: number | string): string {
  const value = toNumber(mb);

  return value === null ? '—' : `${new Intl.NumberFormat('en-GB').format(Math.round(value))} MB`;
}
```

Create `src/lib/monitoring/job-state.ts`:

```ts
import type { JobStateDto } from '@/types/api';

/**
 * One reading of a job's state for the badge on the jobs table (F5-DESIGN D2).
 *
 * **`stale` is the API's word, not ours.** `JobStateAssembler.IsStale` knows the schedule's period,
 * the grace window, and that a job which has never succeeded is stale regardless of timing
 * (Monitoring.md §3). A second copy of that rule here would drift the day the backend's changes, so
 * this function only *orders* the facts the payload already states.
 */
export type JobTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface JobPresentation {
  label: string;
  tone: JobTone;
}

export function presentJobState(job: JobStateDto): JobPresentation {
  if (job.lastRun === null) {
    // No history is not a failure: the job has had no chance yet, and the API agrees — it never
    // flags such a job stale (§3). Said in words rather than left as an empty cell.
    return { label: 'Has not run yet', tone: 'neutral' };
  }

  if (job.stale) {
    return { label: 'Stale', tone: 'danger' };
  }

  if (job.lastRun.status === 'Running') {
    return { label: 'Running', tone: 'info' };
  }

  if (job.lastRun.status === 'Failed') {
    return { label: 'Last run failed', tone: 'warning' };
  }

  return { label: 'Healthy', tone: 'success' };
}
```

Create `src/lib/monitoring/runs.ts`:

```ts
import type { JobRunDto, JobRunsPage } from '@/types/api';

/**
 * Paging `/monitoring/jobs/{name}/runs` the way `hasMore` is defined (Monitoring.md §7): the next
 * page is the same query with `to` moved to the oldest `startedAtUtc` this page returned. There is
 * no page number and no total — `hasMore` comes from fetching `limit + 1` rows.
 */
export function nextRunsCursor(page: JobRunsPage): string | undefined {
  if (!page.hasMore || page.runs.length === 0) {
    return undefined;
  }

  // Reduced rather than `runs.at(-1)`: the contract says newest first, but the cursor must be
  // right even if a page ever arrives unsorted — a wrong cursor skips history silently.
  return page.runs.reduce(
    (oldest, run) => (run.startedAtUtc < oldest ? run.startedAtUtc : oldest),
    page.runs[0]!.startedAtUtc,
  );
}

/**
 * Every page so far as one list, de-duplicated by id. `to` is inclusive, so the run at the cursor
 * is the last row of one page and the first of the next.
 */
export function mergeRunPages(pages: readonly JobRunsPage[]): JobRunDto[] {
  const seen = new Set<string>();
  const merged: JobRunDto[] = [];

  for (const page of pages) {
    for (const run of page.runs) {
      if (!seen.has(run.id)) {
        seen.add(run.id);
        merged.push(run);
      }
    }
  }

  return merged;
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test monitoring-format job-state monitoring-runs`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/monitoring tests/unit/monitoring-format.test.ts tests/unit/job-state.test.ts tests/unit/monitoring-runs.test.ts
git commit -m "The monitoring rules that could rot, as pure functions

Job state is ordered from the API's own stale flag and never recomputed;
the run cursor follows hasMore's definition and tolerates the inclusive
boundary returning one row twice."
```

---

### Task 5: The settings rules, as pure functions

Implements **D5** (render by type) and **D6** (send only what changed; the mask is never sent; null resets).

**Files:**

- Create: `src/lib/settings/diff.ts`
- Create: `src/lib/settings/values.ts`
- Create: `tests/unit/settings-diff.test.ts`, `tests/unit/settings-values.test.ts`

**Interfaces:**

- Produces:
  - `type SettingsDraft = Record<string, string | null>` — key → the operator's value; `null` means "reset to default"; a key absent from the draft is untouched
  - `settingsDiff(original: readonly SettingView[], draft: SettingsDraft): SettingValueWrite[]`
  - `settingsFingerprint(settings: readonly SettingView[]): string` — changes whenever a value or source does, for keying the form so a save resets it
  - `settingBool(value: string | null | undefined): boolean` — case-insensitive `true`
  - `validateSettingValue(view: SettingView, value: string): string | null`
  - `settingLabel(key: string): string` — `general.platform_name` → `Platform name`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/settings-diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settingsDiff, settingsFingerprint } from '@/lib/settings/diff';
import { SETTING_MASK, type SettingView } from '@/types/api';

function view(overrides: Partial<SettingView> = {}): SettingView {
  return {
    key: 'general.platform_name',
    category: 'General',
    valueType: 'String',
    isSensitive: false,
    description: 'The platform’s display name.',
    value: 'GymOS',
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
    ...overrides,
  };
}

const name = view();
const port = view({ key: 'email.smtp_port', category: 'Email', valueType: 'Int', value: '1025' });
const tls = view({
  key: 'email.smtp_use_starttls',
  category: 'Email',
  valueType: 'Bool',
  value: 'false',
});
const password = view({
  key: 'email.smtp_password',
  category: 'Email',
  isSensitive: true,
  value: SETTING_MASK,
  source: 'Database',
});

describe('settingsDiff (D6)', () => {
  it('sends only the keys whose value changed', () => {
    // Sending an untouched row would flip its source to Database — a row nobody set, that now
    // shadows configuration forever.
    expect(settingsDiff([name, port], { 'general.platform_name': 'Acme Fit' })).toEqual([
      { key: 'general.platform_name', value: 'Acme Fit' },
    ]);
  });

  it('sends nothing for a draft equal to the current value', () => {
    expect(settingsDiff([name], { 'general.platform_name': 'GymOS' })).toEqual([]);
  });

  it('sends null for a reset — the row is deleted and the key falls through to the layer below', () => {
    const stored = view({ value: 'Acme Fit', source: 'Database' });

    expect(settingsDiff([stored], { 'general.platform_name': null })).toEqual([
      { key: 'general.platform_name', value: null },
    ]);
  });

  it('never sends the mask, even when the draft still holds it', () => {
    // A sensitive row reads as •••• once stored. Echoing that back is "unchanged" to the API, but
    // it should never be on the wire from here: an unchanged row is not sent at all.
    expect(settingsDiff([password], { 'email.smtp_password': SETTING_MASK })).toEqual([]);
  });

  it('sends a replacement secret, and null to clear one', () => {
    expect(settingsDiff([password], { 'email.smtp_password': 'hunter2' })).toEqual([
      { key: 'email.smtp_password', value: 'hunter2' },
    ]);
    expect(settingsDiff([password], { 'email.smtp_password': null })).toEqual([
      { key: 'email.smtp_password', value: null },
    ]);
  });

  it('treats a Bool that parses the same as unchanged, whatever its casing', () => {
    expect(settingsDiff([tls], { 'email.smtp_use_starttls': 'False' })).toEqual([]);
    expect(settingsDiff([tls], { 'email.smtp_use_starttls': 'true' })).toEqual([
      { key: 'email.smtp_use_starttls', value: 'true' },
    ]);
  });

  it('ignores a draft key that is not in this category’s views', () => {
    // The API would refuse it (`settings.wrong_category`) and the whole batch with it.
    expect(settingsDiff([name], { 'email.smtp_port': '25' })).toEqual([]);
  });
});

describe('settingsFingerprint', () => {
  it('changes when a value or its source changes, and not otherwise', () => {
    const before = settingsFingerprint([name, port]);

    expect(settingsFingerprint([name, port])).toBe(before);
    expect(settingsFingerprint([view({ value: 'Acme', source: 'Database' }), port])).not.toBe(
      before,
    );
  });
});
```

Create `tests/unit/settings-values.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { settingBool, settingLabel, validateSettingValue } from '@/lib/settings/values';
import type { SettingView } from '@/types/api';

function view(valueType: string, key = 'x.y'): SettingView {
  return {
    key,
    category: 'General',
    valueType,
    isSensitive: false,
    description: '',
    value: null,
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
  };
}

describe('settingBool', () => {
  it('reads the API’s bool string case-insensitively, and anything else as false', () => {
    // `bool.TryParse` accepts "True" and "true"; a stored row may carry either.
    expect(settingBool('true')).toBe(true);
    expect(settingBool('True')).toBe(true);
    expect(settingBool('false')).toBe(false);
    expect(settingBool(null)).toBe(false);
    expect(settingBool('yes')).toBe(false);
  });
});

describe('validateSettingValue (D5)', () => {
  it('requires a whole number for Int — the range itself is the API’s to enforce', () => {
    // Min/Max are not on the wire (SettingView carries no range), so the console checks only the
    // type and lets `settings.invalid_value` name the range.
    expect(validateSettingValue(view('Int'), '25')).toBeNull();
    expect(validateSettingValue(view('Int'), '-3')).toBeNull();
    expect(validateSettingValue(view('Int'), '2.5')).toMatch(/whole number/i);
    expect(validateSettingValue(view('Int'), 'abc')).toMatch(/whole number/i);
  });

  it('requires true or false for Bool', () => {
    expect(validateSettingValue(view('Bool'), 'true')).toBeNull();
    expect(validateSettingValue(view('Bool'), 'maybe')).toMatch(/on or off/i);
  });

  it('accepts an empty string for every type — it clears the row', () => {
    expect(validateSettingValue(view('Int'), '')).toBeNull();
    expect(validateSettingValue(view('Bool'), '')).toBeNull();
  });

  it('accepts anything for String and for a type it does not know', () => {
    expect(validateSettingValue(view('String'), 'anything')).toBeNull();
    expect(validateSettingValue(view('Json'), '{not json')).toBeNull();
  });
});

describe('settingLabel', () => {
  it('drops the category prefix and reads the key as words', () => {
    expect(settingLabel('general.platform_name')).toBe('Platform name');
    expect(settingLabel('security.sign_in_attempts_per_window')).toBe(
      'Sign in attempts per window',
    );
    expect(settingLabel('email.smtp_use_starttls')).toBe('Smtp use starttls');
  });

  it('leaves a key with no dot as it is, sentence-cased', () => {
    expect(settingLabel('platform_name')).toBe('Platform name');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm test settings-diff settings-values`
Expected: FAIL — neither module resolves.

- [ ] **Step 3: Implement**

Create `src/lib/settings/values.ts`:

```ts
import type { SettingView } from '@/types/api';

/**
 * Reading and checking one setting's value by its declared type (F5-DESIGN D5).
 *
 * The catalogue's four types are `String`, `Int`, `Bool`, `Json` (Settings.md §1); the console
 * renders three and treats the fourth — which no declared key uses today — as text.
 */

/** `bool.TryParse` on the server accepts either casing; a row may hold either. */
export function settingBool(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/**
 * Why this value would be refused, or `null`. Type only: `Min`/`Max` are not part of `SettingView`,
 * so the range stays the API's to state (`settings.invalid_value` names the key and the rule).
 * An empty string is always accepted — it clears the row (§4 step 4).
 */
export function validateSettingValue(view: SettingView, value: string): string | null {
  if (value === '') {
    return null;
  }

  switch (view.valueType) {
    case 'Int':
      return /^-?\d+$/.test(value.trim()) ? null : 'Enter a whole number.';
    case 'Bool':
      return /^(true|false)$/i.test(value.trim()) ? null : 'Choose on or off.';
    default:
      return null;
  }
}

/** `security.lockout_minutes` → `Lockout minutes`. The raw key is shown beside it, unchanged. */
export function settingLabel(key: string): string {
  const separator = key.indexOf('.');
  const tail = separator === -1 ? key : key.slice(separator + 1);
  const words = tail.replace(/_/g, ' ').trim();

  return words.length === 0 ? words : `${words[0]!.toUpperCase()}${words.slice(1)}`;
}
```

Create `src/lib/settings/diff.ts`:

```ts
import { SETTING_MASK, type SettingValueWrite, type SettingView } from '@/types/api';
import { settingBool } from '@/lib/settings/values';

/**
 * What a save sends (F5-DESIGN D6): only the keys that changed, `null` for a reset, and never the
 * mask.
 *
 * **Why not the whole form.** `PUT /settings` upserts a row for every key it receives, and a row's
 * existence is what makes its `source` read `Database` (Settings.md §2). Sending untouched rows
 * would silently convert "the default" into "a value someone set" for every key on the tab, and a
 * later configuration change would then be shadowed by rows nobody meant to create.
 */

/** Key → the operator's value. `null` means "reset to default"; an absent key is untouched. */
export type SettingsDraft = Record<string, string | null>;

function unchanged(view: SettingView, draft: string): boolean {
  if (view.valueType === 'Bool') {
    return settingBool(view.value) === settingBool(draft);
  }

  return (view.value ?? '') === draft;
}

export function settingsDiff(
  original: readonly SettingView[],
  draft: SettingsDraft,
): SettingValueWrite[] {
  const changes: SettingValueWrite[] = [];

  for (const view of original) {
    if (!(view.key in draft)) {
      continue;
    }

    const value = draft[view.key] ?? null;

    if (value === null) {
      changes.push({ key: view.key, value: null });
      continue;
    }

    // The mask means "unchanged" to the API (§4 step 3), and an unchanged row is not sent at all —
    // so it never appears on the wire from this console.
    if (view.isSensitive && value === SETTING_MASK) {
      continue;
    }

    if (unchanged(view, value)) {
      continue;
    }

    changes.push({ key: view.key, value });
  }

  return changes;
}

/**
 * A key for the form component, so a successful save (which replaces the views) remounts it with an
 * empty draft — the pattern F2's price editor and F4's plan card use with `rowVersion`. Settings have
 * no single version, so this stands in for one.
 */
export function settingsFingerprint(settings: readonly SettingView[]): string {
  return settings.map((view) => `${view.key}=${view.value ?? ''}@${view.source}`).join('|');
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `pnpm test settings-diff settings-values`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings tests/unit/settings-diff.test.ts tests/unit/settings-values.test.ts
git commit -m "The settings rules that could rot, as pure functions

settingsDiff sends only what changed, null to reset, and never the mask —
because every key a PUT receives becomes a Database-sourced row."
```

---

### Task 6: Two nav entries

Implements the spec's nav rule (Monitoring after Administrators, Settings last; ARCHITECTURE §5) and **D9**.

**Files:**

- Modify: `src/lib/nav/items.ts`
- Modify: `src/components/layout/app-shell.tsx` (one comment)
- Test: `tests/unit/dashboard-permissions.test.ts` (extend the `navigation visibility` block)

- [ ] **Step 1: Write the failing test**

Append inside `describe('navigation visibility', …)` in `tests/unit/dashboard-permissions.test.ts`:

```ts
  it('shows Monitoring to monitoring.read alone — the SupportAgent shape (F5 D9)', () => {
    const monitoring = NAV_ITEMS.find((item) => item.href === '/monitoring')!;

    expect(isVisible(monitoring, holding('monitoring.read'))).toBe(true);
    expect(isVisible(monitoring, holding('analytics.read'))).toBe(false);
  });

  it('shows Settings to settings.read, and places it last', () => {
    const settings = NAV_ITEMS.find((item) => item.href === '/settings')!;

    expect(isVisible(settings, holding('settings.read'))).toBe(true);
    expect(isVisible(settings, holding('monitoring.read'))).toBe(false);
    expect(NAV_ITEMS[NAV_ITEMS.length - 1]).toBe(settings);
  });

  it('places Monitoring directly after Administrators', () => {
    const labels = NAV_ITEMS.map((item) => item.label);

    expect(labels.indexOf('Monitoring')).toBe(labels.indexOf('Administrators') + 1);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test dashboard-permissions`
Expected: FAIL — `find` returns undefined.

- [ ] **Step 3: Implement**

In `src/lib/nav/items.ts`, add `Activity` and `Settings` to the `lucide-react` import, and insert two entries into `NAV_ITEMS` so the list reads, in order: Dashboard, Gyms, Analytics, Plans, Invoices, Features, Administrators, **Monitoring**, Audit log, **Settings**. The two new objects:

```ts
  // After Administrators, per ARCHITECTURE §5. Its own screen rather than dashboard panels because
  // SupportAgent holds `monitoring.read` and not `analytics.read` (F5-DESIGN D1).
  { label: 'Monitoring', href: '/monitoring', icon: Activity, permission: 'monitoring.read' },
```

```ts
  // Last, per ARCHITECTURE §5.
  { label: 'Settings', href: '/settings', icon: Settings, permission: 'settings.read' },
```

Leave every existing entry exactly as it is. In `src/components/layout/app-shell.tsx`, change the comment "Seven destinations fit a rail without scrolling" to "Ten destinations fit a rail without scrolling" — the collapsed rail's `overflow-visible` depends on that fact, and at ten items of 44 px it still holds on any viewport taller than 560 px.

- [ ] **Step 4: Run it and watch it pass**

Run: `pnpm test dashboard-permissions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav/items.ts src/components/layout/app-shell.tsx tests/unit/dashboard-permissions.test.ts
git commit -m "Monitoring and Settings join the navigation, in the order the architecture fixes"
```

---

### Task 7: The monitoring overview

Implements **D1**, **D2**, **D3**. The dashboard's health rows are extracted into a shared presentational component so both screens render one reading of a health status without either fetching the other's endpoint (`/dashboard/health` is `analytics.read`; the overview is `monitoring.read`).

**Files:**

- Create: `src/features/monitoring/health-rows.tsx`
- Modify: `src/features/dashboard/health-panel.tsx`
- Create: `src/features/monitoring/process-tile.tsx`
- Create: `src/features/monitoring/outbox-tile.tsx`
- Create: `src/features/monitoring/jobs-table.tsx`
- Create: `src/app/(admin)/monitoring/page.tsx`
- Create: `tests/unit/monitoring-tiles.test.tsx`

**Interfaces:**

- Consumes: `monitoring.overview` (Task 3); `presentJobState`, `formatCpu`, `formatSeconds`, `formatMegabytes` (Task 4); `DataTable`, `Badge`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Skeleton`, `ApiErrorText`, `PageHeader`; `formatDateTime`, `formatRelative` from `@/lib/utils/format`.
- Produces:
  - `HealthRows({ health }: { health: DashboardHealth }): ReactElement` and `HealthUnreachableRow(): ReactElement`
  - `ProcessTile({ process }: { process: ProcessMetrics | null }): ReactElement`
  - `OutboxTile({ outbox }: { outbox: OutboxDepth }): ReactElement`
  - `JobsTable({ jobs }: { jobs: readonly JobStateDto[] }): ReactElement`

- [ ] **Step 1: Extract the health rows**

Create `src/features/monitoring/health-rows.tsx` by moving `PRESENTATION` and `StatusRow` out of `health-panel.tsx` unchanged, and exporting:

```tsx
import type { DashboardHealth } from '@/types/api';

// PRESENTATION and StatusRow: moved verbatim from features/dashboard/health-panel.tsx, including
// the comment on why status is never carried by colour alone.

/** The overall status first, then one row per check — the same rows on the dashboard and on /monitoring. */
export function HealthRows({ health }: { health: DashboardHealth }) {
  return (
    <div className="space-y-2">
      <StatusRow name="Overall" status={health.status} emphasis />
      {health.checks.map((check) => (
        <StatusRow key={check.name} name={check.name} status={check.status} />
      ))}
    </div>
  );
}

/** A failed health request is itself a signal; "Unreachable" is honest where nothing would read as "fine". */
export function HealthUnreachableRow() {
  return <StatusRow name="Health checks" status="Unreachable" />;
}
```

Then reduce `HealthPanel`'s body to render `<HealthUnreachableRow />` on error and `<HealthRows health={query.data} />` on success. Its query, polling and card are unchanged. Run `pnpm test` — the dashboard tests must stay green before anything new is added.

- [ ] **Step 2: The two tiles**

Create `src/features/monitoring/process-tile.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCpu, formatMegabytes, formatSeconds } from '@/lib/monitoring/format';
import { formatDateTime } from '@/lib/utils/format';
import type { ProcessMetrics } from '@/types/api';

/**
 * One replica's own view of itself, and labelled as such (F5-DESIGN D3; Monitoring.md §6).
 *
 * The title carries `instance` because with several replicas these numbers describe whichever one
 * answered — presenting them as "the platform's CPU" is the misreading §10 warns a console against.
 * Fleet-wide figures are App Insights'.
 */
export function ProcessTile({ process }: { process: ProcessMetrics | null }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          Process{process ? ` · ${process.instance}` : ''}
        </CardTitle>
        <CardDescription>This replica only. Fleet-wide figures live in App Insights.</CardDescription>
      </CardHeader>
      <CardContent>
        {process === null ? (
          // Null until the sampler's first reading, a few seconds after start-up.
          <p className="text-muted-foreground text-sm">No sample yet.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <Metric label="CPU" value={formatCpu(process.cpuPercent) ?? 'Warming up'} />
            <Metric label="Memory" value={formatMegabytes(process.workingSetMb)} />
            <Metric label="Uptime" value={formatSeconds(process.uptimeSeconds)} />
            <p className="text-muted-foreground col-span-3 text-xs">
              Sampled {formatDateTime(process.sampledAtUtc)}
            </p>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
```

`formatCpu` returns null for the first reading (a CPU delta needs two samples), and the tile says "Warming up" rather than showing a dash beside a live memory figure.

Create `src/features/monitoring/outbox-tile.tsx`:

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSeconds } from '@/lib/monitoring/format';
import type { OutboxDepth } from '@/types/api';

/**
 * Depth only, and the payload's own `note` says why (F5-DESIGN D3; Monitoring.md §5).
 *
 * Printed verbatim: the backend wrote that sentence so a console showing depth without lag would
 * not need a wiki page to explain the gap, and paraphrasing it here would put the explanation back
 * in a place that rots.
 */
export function OutboxTile({ outbox }: { outbox: OutboxDepth }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Outbox</CardTitle>
        <CardDescription>{outbox.note}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-4 text-sm">
          <Figure label="Messages" value={String(outbox.totalMessages)} />
          <Figure label="Last 24 h" value={String(outbox.messagesLast24h)} />
          <Figure label="Oldest" value={formatSeconds(outbox.oldestMessageAgeSeconds)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: The jobs table**

Create `src/features/monitoring/jobs-table.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { Activity } from 'lucide-react';
import { presentJobState } from '@/lib/monitoring/job-state';
import { formatDateTime, formatRelative } from '@/lib/utils/format';
import type { JobStateDto } from '@/types/api';

/**
 * Every registered job: schedule, last run, last success, next due, and the API's own state word.
 *
 * `stale` is rendered, never computed (F5-DESIGN D2). A failed run's `error` is shown exactly as
 * sent — bounded to type and message server-side (Monitoring.md §2), which is what makes this table
 * safe for SupportAgent to read.
 */
export function JobsTable({ jobs }: { jobs: readonly JobStateDto[] }) {
  const columns: Column<JobStateDto>[] = [
    {
      key: 'name',
      header: 'Job',
      primary: true,
      render: (job) => (
        <span className="flex flex-col">
          <Link
            href={`/monitoring/jobs/${encodeURIComponent(job.name)}`}
            className="font-medium underline-offset-2 hover:underline"
          >
            {job.name}
          </Link>
          <span className="text-muted-foreground text-xs">{job.schedule}</span>
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (job) => {
        const state = presentJobState(job);
        return (
          <span className="flex flex-col gap-1">
            <Badge tone={state.tone}>{state.label}</Badge>
            {job.lastRun?.error && (
              <span className="text-destructive text-xs break-words">{job.lastRun.error}</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'lastRun',
      header: 'Last run',
      render: (job) =>
        job.lastRun ? (
          <span title={formatDateTime(job.lastRun.startedAtUtc)}>
            {formatRelative(job.lastRun.startedAtUtc)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'lastSuccess',
      header: 'Last success',
      desktopOnly: true,
      render: (job) => formatDateTime(job.lastSucceededAtUtc),
    },
    {
      key: 'nextDue',
      header: 'Next due',
      render: (job) => formatDateTime(job.nextDueUtc),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={[...jobs]}
      rowKey={(job) => job.name}
      empty={
        <EmptyState
          icon={Activity}
          title="No jobs registered"
          description="The job host has not described any job to the API."
        />
      }
    />
  );
}
```

- [ ] **Step 4: The page**

Create `src/app/(admin)/monitoring/page.tsx`. Read `node_modules/next/dist/docs/` on client pages first (AGENTS.md).

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { HealthRows } from '@/features/monitoring/health-rows';
import { JobsTable } from '@/features/monitoring/jobs-table';
import { OutboxTile } from '@/features/monitoring/outbox-tile';
import { ProcessTile } from '@/features/monitoring/process-tile';
import { monitoring } from '@/lib/api/endpoints';

/**
 * Is the platform healthy right now (F5-DESIGN D1). Its own screen, not dashboard panels, because
 * SupportAgent holds `monitoring.read` and not `analytics.read` (Monitoring.md §8).
 *
 * Polled every 60 seconds while visible, like the dashboard's health panel: the whole point of the
 * page is to be current. Two endpoints per minute per open tab is deliberate and cheap (spec §7).
 */
export default function MonitoringPage() {
  const query = useQuery({
    queryKey: ['monitoring', 'overview'],
    queryFn: ({ signal }) => monitoring.overview(signal),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  return (
    <>
      <PageHeader
        title="Monitoring"
        description="Health, this replica's process, outbox depth, and whether every scheduled job has run. Refreshes each minute."
      />

      {query.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : query.isError ? (
        <ApiErrorText error={query.error} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Health</CardTitle>
              </CardHeader>
              <CardContent>
                <HealthRows health={query.data.health} />
              </CardContent>
            </Card>
            <ProcessTile process={query.data.process} />
            <OutboxTile outbox={query.data.outbox} />
          </div>

          <section aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="mb-3 text-lg font-semibold">
              Jobs
            </h2>
            <JobsTable jobs={query.data.jobs} />
          </section>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Write the tests that pin the three rules**

Create `tests/unit/monitoring-tiles.test.tsx`. Fixtures are built with small factories; each test asserts one decision.

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobsTable } from '@/features/monitoring/jobs-table';
import { OutboxTile } from '@/features/monitoring/outbox-tile';
import { ProcessTile } from '@/features/monitoring/process-tile';
import type { JobStateDto, OutboxDepth, ProcessMetrics } from '@/types/api';

const succeeded = {
  id: 'run-1',
  jobName: 'retention',
  instance: 'replica-a',
  status: 'Succeeded',
  startedAtUtc: '2026-09-20T02:00:00Z',
  finishedAtUtc: '2026-09-20T02:00:04Z',
  durationMs: 4000,
  error: null,
};

function jobState(partial: Partial<JobStateDto>): JobStateDto {
  return {
    name: 'retention',
    schedule: 'daily at 02:00 UTC',
    lastRun: succeeded,
    lastSucceededAtUtc: '2026-09-20T02:00:00Z',
    nextDueUtc: '2026-09-21T02:00:00Z',
    stale: false,
    ...partial,
  };
}

/** DataTable renders a table and mobile cards; the table's rows are the ones asserted on. */
function tableRow(text: string): HTMLElement {
  const row = screen.getAllByRole('row').find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`no row containing ${text}`);
  return row;
}

describe('JobsTable', () => {
  it('reads a job with no history as not yet run, and never as stale (D2)', () => {
    render(<JobsTable jobs={[jobState({ name: 'platform-stats', lastRun: null, lastSucceededAtUtc: null })]} />);

    expect(tableRow('platform-stats')).toHaveTextContent('Has not run yet');
    expect(tableRow('platform-stats')).not.toHaveTextContent('Stale');
  });

  it('shows Stale because the API said so, whatever the timestamps suggest (D2)', () => {
    render(<JobsTable jobs={[jobState({ stale: true })]} />);

    expect(tableRow('retention')).toHaveTextContent('Stale');
  });

  it('prints a failed run’s error text unchanged (D2)', () => {
    const error = 'TimeoutException: The operation has timed out.';
    render(<JobsTable jobs={[jobState({ lastRun: { ...succeeded, status: 'Failed', error } })]} />);

    expect(tableRow('retention')).toHaveTextContent(error);
  });

  it('links each job to its run history', () => {
    render(<JobsTable jobs={[jobState({ name: 'subscription-renewal' })]} />);

    expect(screen.getAllByRole('link', { name: 'subscription-renewal' })[0]).toHaveAttribute(
      'href',
      '/monitoring/jobs/subscription-renewal',
    );
  });
});

describe('ProcessTile (D3)', () => {
  const sample: ProcessMetrics = {
    cpuPercent: null,
    workingSetMb: 312,
    uptimeSeconds: 720,
    instance: 'replica-a',
    sampledAtUtc: '2026-09-20T10:00:00Z',
  };

  it('names the replica and says the CPU figure is warming up while it is null', () => {
    render(<ProcessTile process={sample} />);

    expect(screen.getByText(/replica-a/)).toBeVisible();
    expect(screen.getByText('Warming up')).toBeVisible();
    expect(screen.getByText('312 MB')).toBeVisible();
  });

  it('shows the CPU figure once the sampler has one', () => {
    render(<ProcessTile process={{ ...sample, cpuPercent: 4.25 }} />);

    expect(screen.getByText('4.3%')).toBeVisible();
  });

  it('says there is no sample yet when the block is null', () => {
    render(<ProcessTile process={null} />);

    expect(screen.getByText('No sample yet.')).toBeVisible();
  });
});

describe('OutboxTile (D3)', () => {
  it('prints the API’s note verbatim', () => {
    const outbox: OutboxDepth = {
      totalMessages: 12,
      messagesLast24h: 3,
      oldestMessageAgeSeconds: 90,
      note: 'Depth only. Delivery lag and dead letters are reported once the outbox processor exists.',
    };
    render(<OutboxTile outbox={outbox} />);

    expect(screen.getByText(outbox.note)).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('1 min')).toBeVisible();
  });
});
```

Run: `pnpm test monitoring-tiles`
Expected: PASS, 8 tests. If a test fails, the component is wrong, not the test — each assertion is a spec decision.

- [ ] **Step 6: See it in the browser**

Start the stack per `tests/e2e/README.md`, sign in, open Monitoring from the sidebar. Expected: three tiles, five job rows (`feature-override-sweep`, `invoice-overdue`, `platform-stats`, `subscription-renewal`, `retention`) each reading "Has not run yet" against a fresh test backend (`Jobs__Enabled=false`), and the outbox note printed under its title. Check at 375 px that the tiles stack and the jobs render as cards.

- [ ] **Step 7: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "The monitoring overview: health, one replica's process, outbox depth, and every job's state

Stale is the API's word and is only rendered; the outbox note and a run's
error are printed as sent. Health rows are shared with the dashboard."
```

---

### Task 8: One job's run history

Implements **D4**. Cursor paging through TanStack's `useInfiniteQuery`, with the cursor and the merge from Task 4.

**Files:**

- Create: `src/features/monitoring/job-runs-list.tsx`
- Create: `src/app/(admin)/monitoring/jobs/[name]/page.tsx`
- Create: `tests/unit/job-runs-list.test.tsx`

**Interfaces:**

- Consumes: `monitoring.runs` (Task 3); `nextRunsCursor`, `mergeRunPages`, `formatDuration` (Task 4); `JOB_RUN_STATUSES`, `JobRunStatus`, `JobRunDto` (Task 1); `Select*`, `Button`, `DataTable`, `EmptyState`, `Badge`.
- Produces:
  - `type RunStatusFilter = JobRunStatus | 'all'`
  - `JobRunsList({ runs, hasMore, loadingMore, status, onStatusChange, onLoadOlder })` — presentational; `onLoadOlder: () => void`, `onStatusChange: (status: RunStatusFilter) => void`

- [ ] **Step 1: The list**

Create `src/features/monitoring/job-runs-list.tsx`:

```tsx
'use client';

import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { formatDuration } from '@/lib/monitoring/format';
import { formatDateTime } from '@/lib/utils/format';
import { JOB_RUN_STATUSES, type JobRunDto, type JobRunStatus } from '@/types/api';

export type RunStatusFilter = JobRunStatus | 'all';

const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  Running: 'info',
  Succeeded: 'success',
  Failed: 'danger',
};

/**
 * A job's runs, newest first, with the status filter the API offers and "Load older" for the next
 * page (F5-DESIGN D4). Paging is by time, not by number: the container moves `to` to the oldest run
 * it has, as `hasMore` is defined (Monitoring.md §7).
 */
export function JobRunsList({
  runs,
  hasMore,
  loadingMore,
  status,
  onStatusChange,
  onLoadOlder,
}: {
  runs: readonly JobRunDto[];
  hasMore: boolean;
  loadingMore: boolean;
  status: RunStatusFilter;
  onStatusChange: (status: RunStatusFilter) => void;
  onLoadOlder: () => void;
}) {
  const columns: Column<JobRunDto>[] = [
    {
      key: 'startedAtUtc',
      header: 'Started',
      primary: true,
      render: (run) => formatDateTime(run.startedAtUtc),
    },
    {
      key: 'status',
      header: 'Status',
      render: (run) => (
        <span className="flex flex-col gap-1">
          <Badge tone={TONES[run.status] ?? 'neutral'}>{run.status}</Badge>
          {/* Exactly as sent — the backend bounds it to type and message (Monitoring.md §2). */}
          {run.error && <span className="text-destructive text-xs break-words">{run.error}</span>}
        </span>
      ),
    },
    { key: 'durationMs', header: 'Duration', render: (run) => formatDuration(run.durationMs) },
    {
      key: 'instance',
      header: 'Instance',
      desktopOnly: true,
      render: (run) => <span className="font-mono text-xs">{run.instance}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="run-status">Status</Label>
        <Select value={status} onValueChange={(value) => onStatusChange(value as RunStatusFilter)}>
          <SelectTrigger id="run-status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {JOB_RUN_STATUSES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={[...runs]}
        rowKey={(run) => run.id}
        empty={
          <EmptyState
            icon={History}
            title="No runs recorded"
            description={
              status === 'all'
                ? 'This job has not run yet, or its history has passed the retention window.'
                : `No ${status.toLowerCase()} runs in the recorded history.`
            }
          />
        }
      />

      {hasMore && (
        <Button variant="outline" onClick={onLoadOlder} loading={loadingMore}>
          Load older
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: The page**

Create `src/app/(admin)/monitoring/jobs/[name]/page.tsx`. `useParams` is the client-side way to read a dynamic segment — confirm against `node_modules/next/dist/docs/` before relying on it.

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { JobRunsList, type RunStatusFilter } from '@/features/monitoring/job-runs-list';
import { monitoring } from '@/lib/api/endpoints';
import { mergeRunPages, nextRunsCursor } from '@/lib/monitoring/runs';

const PAGE_SIZE = 50;

/**
 * Did the job that should have run last night actually run (F5-DESIGN D4).
 *
 * `useInfiniteQuery` with a time cursor: each page's `to` is the oldest `startedAtUtc` of the page
 * before, which is how `hasMore` is defined (Monitoring.md §7). Changing the status filter starts a
 * new query — a filter is a different history, not a further page of the same one.
 */
export default function JobRunsPage() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const [status, setStatus] = useState<RunStatusFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ['monitoring', 'runs', name, status],
    queryFn: ({ pageParam, signal }) =>
      monitoring.runs(
        name,
        { to: pageParam, status: status === 'all' ? undefined : status, limit: PAGE_SIZE },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => nextRunsCursor(lastPage),
  });

  return (
    <>
      <PageHeader
        title={name}
        description={
          <>
            Run history, newest first.{' '}
            <Link href="/monitoring" className="underline underline-offset-2">
              Back to monitoring
            </Link>
          </>
        }
      />

      {query.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError ? (
        <ApiErrorText error={query.error} />
      ) : (
        <JobRunsList
          runs={mergeRunPages(query.data.pages)}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          status={status}
          onStatusChange={setStatus}
          onLoadOlder={() => void query.fetchNextPage()}
        />
      )}
    </>
  );
}
```

An unknown name is `404 monitoring.job_not_found`, which `ApiErrorText` renders with the sentence Task 2 mapped.

- [ ] **Step 3: Write the tests that pin the list**

Create `tests/unit/job-runs-list.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobRunsList } from '@/features/monitoring/job-runs-list';
import type { JobRunDto } from '@/types/api';

function aRun(id: string, partial: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id,
    jobName: 'invoice-overdue',
    instance: 'replica-b',
    status: 'Succeeded',
    startedAtUtc: '2026-09-20T03:00:00Z',
    finishedAtUtc: '2026-09-20T03:00:02Z',
    durationMs: 2000,
    error: null,
    ...partial,
  };
}

const noop = { onStatusChange: vi.fn(), onLoadOlder: vi.fn() };

describe('JobRunsList (D4)', () => {
  it('offers Load older only while the API says older runs exist', () => {
    const { rerender } = render(
      <JobRunsList runs={[aRun('1')]} hasMore status="all" loadingMore={false} {...noop} />,
    );
    expect(screen.getByRole('button', { name: 'Load older' })).toBeVisible();

    rerender(
      <JobRunsList runs={[aRun('1')]} hasMore={false} status="all" loadingMore={false} {...noop} />,
    );
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();
  });

  it('asks for the next page when Load older is clicked', async () => {
    const onLoadOlder = vi.fn();
    render(
      <JobRunsList
        runs={[aRun('1')]}
        hasMore
        status="all"
        loadingMore={false}
        onStatusChange={vi.fn()}
        onLoadOlder={onLoadOlder}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Load older' }));

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('reports a status choice by the API’s own name', async () => {
    const onStatusChange = vi.fn();
    render(
      <JobRunsList
        runs={[]}
        hasMore={false}
        status="all"
        loadingMore={false}
        onStatusChange={onStatusChange}
        onLoadOlder={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText('Status'));
    await userEvent.click(screen.getByRole('option', { name: 'Failed' }));

    expect(onStatusChange).toHaveBeenCalledWith('Failed');
  });

  it('shows a failed run’s error text as sent, and a running run’s duration as a dash', () => {
    render(
      <JobRunsList
        runs={[
          aRun('f', { status: 'Failed', error: 'InvalidOperationException: lock lost' }),
          aRun('r', { status: 'Running', finishedAtUtc: null, durationMs: null }),
        ]}
        hasMore={false}
        status="all"
        loadingMore={false}
        {...noop}
      />,
    );

    expect(screen.getAllByText('InvalidOperationException: lock lost')[0]).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('explains an empty history in words', () => {
    render(<JobRunsList runs={[]} hasMore={false} status="all" loadingMore={false} {...noop} />);

    expect(screen.getByText('No runs recorded')).toBeVisible();
  });
});
```

Run: `pnpm test job-runs-list`
Expected: PASS, 5 tests. `tests/setup.ts` already stubs the pointer-capture methods Radix `Select` needs under jsdom.

- [ ] **Step 4: See it in the browser**

Click `retention` on `/monitoring`. Expected: the heading is the job name, the status filter reads "All", and the empty state explains the absence. Type a made-up name into the URL and confirm the mapped `monitoring.job_not_found` sentence renders.

- [ ] **Step 5: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "Run history per job, paged by the cursor hasMore defines"
```

---

### Task 9: The settings screen

Implements **D5**, **D6**, **D9**, and the test-email probe (Settings.md §6). Four tabs — General, Email, Security, Retention — each its own query on `GET /settings?category=`, because `PUT /settings` answers with that category's fresh views and the response can replace the cache directly.

**Files:**

- Create: `src/features/settings/setting-source-badge.tsx`
- Create: `src/features/settings/settings-category-form.tsx`
- Create: `src/features/settings/test-email-card.tsx`
- Create: `src/app/(admin)/settings/page.tsx`
- Create: `tests/unit/settings-category-form.test.tsx`, `tests/unit/test-email-card.test.tsx`

**Interfaces:**

- Consumes: `settings.list`, `settings.update`, `settings.testEmail` (Task 3); `settingsDiff`, `settingsFingerprint`, `SettingsDraft`, `settingBool`, `validateSettingValue`, `settingLabel` (Task 5); `SETTING_MASK`, `SettingView`, `SettingCategory`, `SettingValueWrite`, `SmtpConnectionTestResult` (Task 1); `Tabs*`, `Select*`, `Input`, `Label`, `Button`, `Badge`, `Card*`, `ApiErrorText`, `toastApiError`, `usePermission`.
- Produces:
  - `SettingSourceBadge({ source }: { source: string }): ReactElement`
  - `SettingsCategoryForm({ settings, canManage, busy, error, onSave })` — `onSave: (changes: SettingValueWrite[]) => void`
  - `TestEmailCard({ canManage, result, busy, error, onTest })` — `onTest: () => void`, `result: SmtpConnectionTestResult | null`
  - `SettingsCategoryPanel({ category }: { category: SettingCategory })` — the container, exported from the page module for Task 10 to reuse

- [ ] **Step 1: The source badge**

Create `src/features/settings/setting-source-badge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

/**
 * Which layer answered: a stored row beats configuration, which beats the definition's own default
 * (Settings.md §2). Shown on every row because "what is it set to" and "who set it, or did nobody"
 * are the same question when a value surprises an operator. Same tone pattern as `SourceBadge` for
 * features; an unrecognised source still renders its raw value.
 */
const TONES: Record<string, React.ComponentProps<typeof Badge>['tone']> = {
  Database: 'warning',
  Configuration: 'info',
  Default: 'neutral',
};

export function SettingSourceBadge({ source }: { source: string }) {
  return <Badge tone={TONES[source] ?? 'neutral'}>{source}</Badge>;
}
```

- [ ] **Step 2: The category form**

Create `src/features/settings/settings-category-form.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { SettingSourceBadge } from '@/features/settings/setting-source-badge';
import { settingsDiff, type SettingsDraft } from '@/lib/settings/diff';
import { settingBool, settingLabel, validateSettingValue } from '@/lib/settings/values';
import { SETTING_MASK, type SettingValueWrite, type SettingView } from '@/types/api';

/**
 * One category's rows, rendered from the catalogue by type (F5-DESIGN D5), saved as a diff (D6).
 *
 * The draft holds only the keys the operator touched; `null` is a reset. Save is disabled until the
 * diff is non-empty, so an unchanged form never reaches `PUT /settings` — which would otherwise
 * create a Database-sourced row for every key it received. Without `settings.manage` the whole form
 * is read-only: no inputs, no buttons, the same rows (D9).
 *
 * The parent keys this component by `settingsFingerprint(settings)`, so a successful save remounts
 * it with an empty draft.
 */
export function SettingsCategoryForm({
  settings,
  canManage,
  busy,
  error,
  onSave,
}: {
  settings: readonly SettingView[];
  canManage: boolean;
  busy: boolean;
  error: unknown;
  onSave: (changes: SettingValueWrite[]) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({});
  // Sensitive rows whose mask the operator chose to replace with an input.
  const [replacing, setReplacing] = useState<ReadonlySet<string>>(new Set());

  const changes = useMemo(() => settingsDiff(settings, draft), [settings, draft]);

  const problems = settings
    .map((view) => {
      const value = draft[view.key];
      return typeof value === 'string' ? validateSettingValue(view, value) : null;
    })
    .filter((message): message is string => message !== null);

  const set = (key: string, value: string | null) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (changes.length > 0 && problems.length === 0) {
      onSave(changes);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {settings.map((view) => {
        const label = settingLabel(view.key);
        const pending = draft[view.key];
        const isReset = pending === null;
        const shown = typeof pending === 'string' ? pending : (view.value ?? '');
        const masked = view.isSensitive && view.value === SETTING_MASK && !replacing.has(view.key) && !isReset;
        const clientProblem = typeof pending === 'string' ? validateSettingValue(view, pending) : null;

        return (
          <div key={view.key} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={view.key}>{label}</Label>
              <code className="text-muted-foreground text-xs">{view.key}</code>
              <SettingSourceBadge source={isReset ? 'Default' : view.source} />
            </div>
            <p className="text-muted-foreground text-sm">{view.description}</p>

            {!view.valid && view.validationMessage && (
              // The effective value breaks its own rule — a configuration or row nobody validated on
              // the way in. Said plainly rather than styled as a hint.
              <p role="alert" className="text-destructive flex items-center gap-1 text-sm">
                <TriangleAlert className="size-4" aria-hidden />
                {view.validationMessage}
              </p>
            )}

            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                {masked ? (
                  <>
                    <span className="font-mono text-sm" aria-label={`${label} is set`}>
                      {SETTING_MASK}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReplacing((current) => new Set(current).add(view.key))}
                    >
                      Replace value
                    </Button>
                  </>
                ) : isReset ? (
                  <span className="text-muted-foreground text-sm">Will return to its default on save.</span>
                ) : view.valueType === 'Bool' ? (
                  <Select value={settingBool(shown) ? 'true' : 'false'} onValueChange={(value) => set(view.key, value)}>
                    <SelectTrigger id={view.key} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">On</SelectItem>
                      <SelectItem value="false">Off</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={view.key}
                    type={view.valueType === 'Int' ? 'number' : view.isSensitive ? 'password' : 'text'}
                    inputMode={view.valueType === 'Int' ? 'numeric' : undefined}
                    value={shown}
                    autoComplete="off"
                    aria-invalid={clientProblem ? true : undefined}
                    aria-describedby={clientProblem ? `${view.key}-error` : undefined}
                    onChange={(event) => set(view.key, event.target.value)}
                    className="sm:max-w-md"
                  />
                )}

                {view.source === 'Database' && !isReset && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set(view.key, null)}>
                    Reset to default
                  </Button>
                )}
                {isReset && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(({ [view.key]: _, ...rest }) => rest)}>
                    Keep current value
                  </Button>
                )}
              </div>
            ) : (
              <p className="font-mono text-sm">{view.value ?? <span className="text-muted-foreground">not set</span>}</p>
            )}

            {clientProblem && (
              <p id={`${view.key}-error`} role="alert" className="text-destructive text-sm">
                {clientProblem}
              </p>
            )}
          </div>
        );
      })}

      {canManage && (
        <>
          <ApiErrorText error={error} />
          <Button type="submit" loading={busy} disabled={changes.length === 0 || problems.length > 0}>
            Save
          </Button>
        </>
      )}
    </form>
  );
}
```

Read-only rendering prints the value as text — the mask for a sensitive row, since `settings.read` never sees plaintext anyway.

- [ ] **Step 3: The test-email card**

Create `src/features/settings/test-email-card.tsx`:

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import type { SmtpConnectionTestResult } from '@/types/api';

/**
 * Connects, authenticates if a username is set, NOOPs, disconnects — sends nothing (Settings.md §6,
 * ADR-53). A refused login is still a 200 with `ok: false` and the stage it reached; only a disabled
 * sender is a 400 (`settings.email_disabled`), shown as the API's own sentence.
 */
export function TestEmailCard({
  canManage,
  result,
  busy,
  error,
  onTest,
}: {
  canManage: boolean;
  result: SmtpConnectionTestResult | null;
  busy: boolean;
  error: unknown;
  onTest: () => void;
}) {
  if (!canManage) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">SMTP connection</CardTitle>
        <CardDescription>
          Opens the same round trips a real send would and sends nothing. Uses the saved values, so
          save first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" loading={busy} onClick={onTest}>
          Test connection
        </Button>
        <ApiErrorText error={error} />
        {result && (
          <div role="status" className="rounded-md border p-3 text-sm">
            {result.ok ? (
              <>
                <p className="font-medium">Connected.</p>
                {result.server && <p className="text-muted-foreground font-mono text-xs break-all">{result.server}</p>}
              </>
            ) : (
              <>
                <p className="font-medium">Failed at the {result.stage ?? 'unknown'} stage.</p>
                {result.error && <p className="text-muted-foreground">{result.error}</p>}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: The page and its container**

Create `src/app/(admin)/settings/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsCategoryForm } from '@/features/settings/settings-category-form';
import { TestEmailCard } from '@/features/settings/test-email-card';
import { settings } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { usePermission } from '@/lib/auth/session';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { settingsFingerprint } from '@/lib/settings/diff';
import type { SettingCategory, SettingValueWrite, SmtpConnectionTestResult } from '@/types/api';

/** The tabs. Maintenance is deliberately absent — it has its own section and its own endpoint (D7). */
const TABS: SettingCategory[] = ['General', 'Email', 'Security', 'Retention'];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Every declared setting, its effective value, and which layer decided it. A stored value beats configuration, which beats the default."
      />
      <Tabs defaultValue="General">
        <TabsList aria-label="Setting categories">
          {TABS.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((category) => (
          <TabsContent key={category} value={category} className="space-y-6">
            <SettingsCategoryPanel category={category} />
            {category === 'Email' && <TestEmailPanel />}
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

/**
 * One category: read, save the diff, replace the cache with the response.
 *
 * A 409 means another administrator's write raced this one on the same row version (Settings.md §5).
 * The operator is told so and the category is re-read; their draft is lost, which is the honest
 * outcome — reapplying it blind would be the last-write-wins the row version exists to prevent.
 */
export function SettingsCategoryPanel({ category }: { category: SettingCategory }) {
  const canManage = usePermission('settings.manage');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['settings', category],
    queryFn: ({ signal }) => settings.list(category, signal),
  });

  const save = useMutation({
    mutationFn: (values: SettingValueWrite[]) => settings.update({ category, values }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(['settings', category], fresh);
      toast.success('Settings saved.');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        toast.error('Another administrator saved first. The latest values have been reloaded.');
        void queryClient.invalidateQueries({ queryKey: ['settings', category] });
        return;
      }
      // Anything else stays in the form beside Save (settings.invalid_value names the key).
    },
  });

  if (query.isPending) {
    return <Skeleton className="h-48 w-full" aria-busy="true" />;
  }

  if (query.isError) {
    return <ApiErrorText error={query.error} />;
  }

  return (
    <SettingsCategoryForm
      key={settingsFingerprint(query.data)}
      settings={query.data}
      canManage={canManage}
      busy={save.isPending}
      error={save.error instanceof ApiError && save.error.isConflict ? null : save.error}
      onSave={(changes) => save.mutate(changes)}
    />
  );
}

function TestEmailPanel() {
  const canManage = usePermission('settings.manage');
  const [result, setResult] = useState<SmtpConnectionTestResult | null>(null);
  const probe = useMutation({
    mutationFn: () => settings.testEmail(),
    onSuccess: setResult,
    onError: () => setResult(null),
  });

  return (
    <TestEmailCard
      canManage={canManage}
      result={result}
      busy={probe.isPending}
      error={probe.error}
      onTest={() => probe.mutate()}
    />
  );
}
```

`toastApiError` is imported for Task 10's use of this module; if lint flags it unused at this point, drop the import here and add it back in Task 10.

- [ ] **Step 5: Write the tests that pin the form and the probe**

Create `tests/unit/settings-category-form.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsCategoryForm } from '@/features/settings/settings-category-form';
import { SETTING_MASK, type SettingView } from '@/types/api';

function setting(partial: Partial<SettingView>): SettingView {
  return {
    key: 'general.platform_name',
    category: 'General',
    valueType: 'String',
    isSensitive: false,
    description: 'Shown in the console header.',
    value: 'GymOS',
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
    ...partial,
  };
}

const platformName = setting({});
const smtpPort = setting({ key: 'email.smtp_port', category: 'Email', valueType: 'Int', value: '1025', source: 'Configuration' });
const startTls = setting({ key: 'email.smtp_use_starttls', category: 'Email', valueType: 'Bool', value: 'false' });
const smtpPassword = setting({ key: 'email.smtp_password', category: 'Email', isSensitive: true, value: SETTING_MASK, source: 'Database' });

function renderForm(settings: SettingView[], canManage = true, onSave = vi.fn()) {
  render(<SettingsCategoryForm settings={settings} canManage={canManage} busy={false} error={null} onSave={onSave} />);
  return onSave;
}

describe('SettingsCategoryForm', () => {
  it('renders each row by its declared type, with its source and description (D5)', () => {
    renderForm([platformName, smtpPort, startTls]);

    expect(screen.getByLabelText('Platform name')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Smtp port')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Smtp use starttls')).toHaveRole('combobox');
    expect(screen.getByText('Configuration')).toBeVisible();
    expect(screen.getByText('Shown in the console header.')).toBeVisible();
  });

  it('warns when the effective value fails its own rule', () => {
    renderForm([setting({ valid: false, validationMessage: 'must be between 1 and 65535' })]);

    expect(screen.getByRole('alert')).toHaveTextContent('must be between 1 and 65535');
  });

  it('keeps Save disabled until something changed, then sends only that (D6)', async () => {
    const onSave = renderForm([platformName, smtpPort]);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Platform name'));
    await userEvent.type(screen.getByLabelText('Platform name'), 'Acme Fit');
    await userEvent.click(save);

    expect(onSave).toHaveBeenCalledWith([{ key: 'general.platform_name', value: 'Acme Fit' }]);
  });

  it('offers Reset to default only on a stored row, and sends null for it', async () => {
    const stored = setting({ value: 'Acme Fit', source: 'Database' });
    const onSave = renderForm([stored, smtpPort]);

    expect(screen.getAllByRole('button', { name: 'Reset to default' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'general.platform_name', value: null }]);
  });

  it('shows a sensitive value as the mask, and only sends a typed replacement (D6)', async () => {
    const onSave = renderForm([smtpPassword]);

    expect(screen.getByText(SETTING_MASK)).toBeVisible();
    expect(screen.queryByLabelText('Smtp password')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Replace value' }));
    const input = screen.getByLabelText('Smtp password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.clear(input);
    await userEvent.type(input, 'new-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'email.smtp_password', value: 'new-secret' }]);
  });

  it('never sends the mask back, even after Replace value is opened and left alone', async () => {
    renderForm([smtpPassword]);

    await userEvent.click(screen.getByRole('button', { name: 'Replace value' }));

    // The input opens holding the mask; nothing changed, so Save stays disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('sends a Bool as the API’s lowercase word', async () => {
    const onSave = renderForm([startTls]);

    await userEvent.click(screen.getByLabelText('Smtp use starttls'));
    await userEvent.click(screen.getByRole('option', { name: 'On' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'email.smtp_use_starttls', value: 'true' }]);
  });

  it('blocks a non-integer Int before it becomes a round trip', async () => {
    const onSave = renderForm([smtpPort]);

    // jsdom lets a number input hold "2.5"; the API would refuse it as not an integer.
    await userEvent.clear(screen.getByLabelText('Smtp port'));
    await userEvent.type(screen.getByLabelText('Smtp port'), '2.5');

    expect(screen.getByText('Enter a whole number.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only without settings.manage — same rows, no controls (D9)', () => {
    renderForm([platformName, smtpPassword], false);

    expect(screen.getByText('GymOS')).toBeVisible();
    expect(screen.getByText(SETTING_MASK)).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

Create `tests/unit/test-email-card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestEmailCard } from '@/features/settings/test-email-card';
import { ApiError } from '@/lib/api/problems';

describe('TestEmailCard', () => {
  it('asks for the probe on click and reports a reached stage as a failure, not an error', async () => {
    const onTest = vi.fn();
    const { rerender } = render(
      <TestEmailCard canManage result={null} busy={false} error={null} onTest={onTest} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(onTest).toHaveBeenCalledTimes(1);

    rerender(
      <TestEmailCard
        canManage
        result={{ ok: false, stage: 'Authenticate', server: null, error: '535 bad credentials' }}
        busy={false}
        error={null}
        onTest={onTest}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Failed at the Authenticate stage.');
    expect(screen.getByRole('status')).toHaveTextContent('535 bad credentials');
  });

  it('shows the API’s own sentence when the sender is disabled', () => {
    const disabled = new ApiError(
      400,
      'settings.email_disabled',
      'Email is disabled; enable it and save before testing the connection.',
      false,
    );
    render(<TestEmailCard canManage result={null} busy={false} error={disabled} onTest={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/Email is disabled/);
  });

  it('renders nothing without settings.manage', () => {
    const { container } = render(
      <TestEmailCard canManage={false} result={null} busy={false} error={null} onTest={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `pnpm test settings-category-form test-email-card`
Expected: PASS, 12 tests. If `toHaveRole` is unavailable in the installed jest-dom, assert `expect(...).toHaveAttribute('role', 'combobox')` instead — keep the assertion.

- [ ] **Step 6: See it in the browser**

Sign in as the SuperAdmin, open Settings. Change `Platform name`, save, see `Database`; reset, save, see `Default`. On Email, click Test connection and see the API's disabled-sender sentence. Then sign out and, if a PlatformAdmin or ReadOnly account exists locally, confirm the same rows render read-only.

- [ ] **Step 7: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "The settings screen: rows by type, a diff on save, and an SMTP probe that sends nothing"
```

---

### Task 10: Maintenance mode — the toggle, the banner, the notice

Implements **D7**. Three pieces: a confirmed section on the Settings page, a banner in the shell for callers who pass, and a full-page notice for callers the API refuses.

**Files:**

- Create: `src/features/settings/maintenance-section.tsx`
- Create: `src/features/settings/maintenance-banner.tsx`
- Create: `src/components/feedback/maintenance-notice.tsx`
- Create: `src/components/feedback/maintenance-gate.tsx`
- Modify: `src/app/(admin)/settings/page.tsx` (render the section)
- Modify: `src/components/layout/app-shell.tsx` (render the banner above `<main>`)
- Modify: `src/app/providers.tsx` (wrap children in the gate)
- Create: `tests/unit/maintenance.test.tsx`

**Interfaces:**

- Consumes: `settings.list('Maintenance')`, `settings.setMaintenanceMode` (Task 3); `onMaintenanceSet`, `ApiError` (Task 2); `settingBool` (Task 5); `ConfirmDialog`, `DestructiveConfirmDialog`, `Textarea`, `Label`, `Button`, `Card*`.
- Produces:
  - `MaintenanceSection({ settings, canManage, busy, errorMessage, onEnable, onDisable })` — `onEnable: (typed: string, message: string) => void`, `onDisable: () => void`
  - `MaintenanceBanner(): ReactElement | null`
  - `MaintenanceNotice({ message, retryAfterSeconds }: { message: string; retryAfterSeconds: number | null }): ReactElement`
  - `MaintenanceGate({ children }): ReactElement`
  - `maintenanceState(settings: readonly SettingView[]): { enabled: boolean; message: string }` from `@/features/settings/maintenance-section`

- [ ] **Step 1: The section**

Create `src/features/settings/maintenance-section.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, DestructiveConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { settingBool } from '@/lib/settings/values';
import type { SettingView } from '@/types/api';

/** The two Maintenance keys, read from the category's views (Settings.md §1). */
export function maintenanceState(settings: readonly SettingView[]): { enabled: boolean; message: string } {
  const enabled = settings.find((view) => view.key === 'maintenance.enabled');
  const message = settings.find((view) => view.key === 'maintenance.message');

  return { enabled: settingBool(enabled?.value), message: message?.value ?? '' };
}

/**
 * Turning the platform off for everyone but a SuperAdmin (F5-DESIGN D7).
 *
 * Enabling is type-to-confirm — the operator types `maintenance`, and *what they typed* is sent as
 * `X-Confirm-Action` for the API to judge (AD-6). A mis-click must not be able to close the whole
 * platform. Disabling is a plain confirmation: the mistake it guards against is smaller. Neither
 * button exists without `settings.manage` (D9).
 */
export function MaintenanceSection({
  settings,
  canManage,
  busy,
  errorMessage,
  onEnable,
  onDisable,
}: {
  settings: readonly SettingView[];
  canManage: boolean;
  busy: boolean;
  errorMessage: string | null;
  onEnable: (typed: string, message: string) => void;
  onDisable: () => void;
}) {
  const state = maintenanceState(settings);
  const [dialog, setDialog] = useState<'enable' | 'disable' | null>(null);
  const [message, setMessage] = useState(state.message);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Maintenance mode</CardTitle>
        <CardDescription>
          While on, every request except health, sign-in and SuperAdmins is refused with the message
          below. Changes here are recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span className="font-medium">{state.enabled ? 'On' : 'Off'}</span>
          {state.enabled && <span className="text-muted-foreground"> — refused callers see: “{state.message}”</span>}
        </p>

        {canManage &&
          (state.enabled ? (
            <Button variant="outline" onClick={() => setDialog('disable')}>
              Disable maintenance mode
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setDialog('enable')}>
              Enable maintenance mode
            </Button>
          ))}
      </CardContent>

      <DestructiveConfirmDialog
        open={dialog === 'enable'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Enable maintenance mode?"
        description="Everyone without settings.manage is refused on their next request until you disable it."
        expectedHint="Type maintenance to confirm"
        confirmLabel="Enable maintenance mode"
        busy={busy}
        errorMessage={errorMessage}
        onConfirm={(typed) => onEnable(typed, message)}
      />
      {/* The message field lives beside the dialog so the confirmation stays the one thing typed
          into the dialog itself; it is read when Enable is confirmed. */}
      {dialog === 'enable' && (
        <div className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-6">
          <Label htmlFor="maintenance-message">Message shown to refused callers</Label>
          <Textarea
            id="maintenance-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={state.message}
          />
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Disable maintenance mode?"
        description="The platform reopens to every caller immediately."
        confirmLabel="Disable"
        busy={busy}
        onConfirm={onDisable}
      />
    </Card>
  );
}
```

The message textarea renders in the card rather than inside `DestructiveConfirmDialog`, which takes no children. Place it **above** the enable button visually if that reads better; the tests below find it by label either way.

- [ ] **Step 2: Wire it into the Settings page**

In `src/app/(admin)/settings/page.tsx`, add below the `Tabs` a `<MaintenancePanel />`:

```tsx
function MaintenancePanel() {
  const canManage = usePermission('settings.manage');
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['settings', 'Maintenance'],
    queryFn: ({ signal }) => settings.list('Maintenance', signal),
  });

  const toggle = useMutation({
    mutationFn: ({ enabled, message, typed }: { enabled: boolean; message: string | null; typed: string }) =>
      settings.setMaintenanceMode({ enabled, message }, typed),
    onSuccess: (fresh, variables) => {
      // The banner reads the same query key, so it updates on the next render, not the next poll.
      queryClient.setQueryData(['settings', 'Maintenance'], fresh);
      setErrorMessage(null);
      toast.success(variables.enabled ? 'Maintenance mode is on.' : 'Maintenance mode is off.');
    },
    onError: (error, variables) => {
      if (variables.enabled) {
        // A wrong confirmation stays in the dialog, beside the field (the gym-delete pattern).
        setErrorMessage(apiErrorMessage(error));
        return;
      }
      toastApiError(error);
    },
  });

  if (query.isPending) return <Skeleton className="h-32 w-full" aria-busy="true" />;
  if (query.isError) return <ApiErrorText error={query.error} />;

  return (
    <MaintenanceSection
      key={settingsFingerprint(query.data)}
      settings={query.data}
      canManage={canManage}
      busy={toggle.isPending}
      errorMessage={errorMessage}
      onEnable={(typed, message) =>
        toggle.mutate({ enabled: true, message: message.trim() === '' ? null : message, typed })
      }
      // Disabling is confirmed by a plain dialog, but the endpoint still demands the header — the
      // literal word is sent because the operator confirmed, not typed, and the API judges it.
      onDisable={() => toggle.mutate({ enabled: false, message: null, typed: 'maintenance' })}
    />
  );
}
```

Import `apiErrorMessage` alongside `toastApiError`, and `MaintenanceSection`. Render `<MaintenancePanel />` after the `Tabs` inside a `space-y-6` wrapper. An empty message sends `null`, which the API maps to the definition's default (Settings.md §7).

- [ ] **Step 3: The banner**

Create `src/features/settings/maintenance-banner.tsx`:

```tsx
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
```

In `app-shell.tsx`, render `<MaintenanceBanner />` between `<Topbar … />` and `<main>`.

- [ ] **Step 4: The notice and the gate**

Create `src/components/feedback/maintenance-notice.tsx`:

```tsx
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a refused caller sees (F5-DESIGN D7): the maintenance message and the retry time the API
 * sent, full-page — the whole console is closed to them, so no screen underneath is worth showing.
 */
export function MaintenanceNotice({
  message,
  retryAfterSeconds,
}: {
  message: string;
  retryAfterSeconds: number | null;
}) {
  const minutes = retryAfterSeconds === null ? null : Math.max(1, Math.ceil(retryAfterSeconds / 60));

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
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
```

Create `src/components/feedback/maintenance-gate.tsx`:

```tsx
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
```

In `src/app/providers.tsx`, wrap: `<SessionProvider><MaintenanceGate>{children}</MaintenanceGate></SessionProvider>`. The gate sits inside the session provider so a `/auth/me` refused during bootstrap (not an exempt route) shows the notice rather than bouncing to `/login`.

- [ ] **Step 5: Write the tests that pin D7**

Create `tests/unit/maintenance.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceNotice } from '@/components/feedback/maintenance-notice';
import { MaintenanceSection, maintenanceState } from '@/features/settings/maintenance-section';
import type { SettingView } from '@/types/api';

function view(key: string, value: string): SettingView {
  return {
    key,
    category: 'Maintenance',
    valueType: key.endsWith('enabled') ? 'Bool' : 'String',
    isSensitive: false,
    description: '',
    value,
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
  };
}

const off = [view('maintenance.enabled', 'false'), view('maintenance.message', 'Back shortly.')];
const on = [view('maintenance.enabled', 'True'), view('maintenance.message', 'Back at 03:00 UTC.')];

describe('maintenanceState', () => {
  it('reads the two keys, tolerating the server’s casing of the bool', () => {
    expect(maintenanceState(on)).toEqual({ enabled: true, message: 'Back at 03:00 UTC.' });
    expect(maintenanceState(off).enabled).toBe(false);
  });
});

describe('MaintenanceSection (D7)', () => {
  it('sends what the operator typed, verbatim, with the message — and does not check it itself', async () => {
    const onEnable = vi.fn();
    render(
      <MaintenanceSection settings={off} canManage busy={false} errorMessage={null} onEnable={onEnable} onDisable={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable maintenance mode' }));
    await userEvent.clear(screen.getByLabelText('Message shown to refused callers'));
    await userEvent.type(screen.getByLabelText('Message shown to refused callers'), 'Upgrading the database.');
    await userEvent.type(screen.getByLabelText(/type maintenance to confirm/i), 'maintenanec');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable maintenance mode' }));

    // The typo goes to the API, which refuses it (`settings.confirmation_mismatch`); a local check
    // would hide that the server is the one judging.
    expect(onEnable).toHaveBeenCalledWith('maintenanec', 'Upgrading the database.');
  });

  it('keeps the API’s refusal inside the dialog, beside the field', async () => {
    render(
      <MaintenanceSection settings={off} canManage busy={false} errorMessage="That did not match." onEnable={vi.fn()} onDisable={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable maintenance mode' }));

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('That did not match.');
  });

  it('disables through a plain confirmation', async () => {
    const onDisable = vi.fn();
    render(
      <MaintenanceSection settings={on} canManage busy={false} errorMessage={null} onEnable={vi.fn()} onDisable={onDisable} />,
    );

    expect(screen.getByText(/Back at 03:00 UTC/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Disable maintenance mode' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }));

    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('offers neither button without settings.manage (D9)', () => {
    render(
      <MaintenanceSection settings={on} canManage={false} busy={false} errorMessage={null} onEnable={vi.fn()} onDisable={vi.fn()} />,
    );

    expect(screen.getByText('On')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MaintenanceNotice (D7)', () => {
  it('shows the API’s message and the retry time in minutes', () => {
    render(<MaintenanceNotice message="Back at 03:00 UTC." retryAfterSeconds={300} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Maintenance in progress');
    expect(screen.getByRole('alert')).toHaveTextContent('Back at 03:00 UTC.');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in about 5 minutes.');
  });

  it('omits the retry line when the API sent no Retry-After', () => {
    render(<MaintenanceNotice message="Back soon." retryAfterSeconds={null} />);

    expect(screen.queryByText(/Try again in about/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
```

Run: `pnpm test maintenance`
Expected: PASS, 7 tests.

- [ ] **Step 6: Prove the two feeds by hand**

With the stack running: as SuperAdmin, enable maintenance mode with a distinctive message. Expected: the banner appears in the shell within a render, without waiting for the poll. In a second browser profile, sign in as any non-SuperAdmin account (Task 12 seeds one) and expect the full-page notice carrying the message and "about 5 minutes". Disable; reload the second profile; expect the console back.

- [ ] **Step 7: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "Maintenance mode: a typed confirmation, a banner for those who pass, a notice for those who do not

The typed word is sent verbatim and judged by the API. The banner polls
the Maintenance category; a refused caller's next request is intercepted
once, at the app root, into a full-page notice."
```

---

### Task 11: Export CSV on the audit log

Implements **D8** and **D9**. A dialog with a bounded range, a real download through `api.download`, and a sentence saying the export is itself recorded.

**Files:**

- Create: `src/lib/utils/download.ts`
- Create: `src/features/audit/export-dialog.tsx`
- Modify: `src/app/(admin)/audit-logs/page.tsx`
- Create: `tests/unit/export-dialog.test.tsx`

**Interfaces:**

- Consumes: `auditLogs.export` (Task 3); `defaultExportRange`, `explainInvalidExportRange`, `exportRangeToQuery`, `DateRange` (Task 2); `Dialog*`, `Input`, `Label`, `Button`, `ApiErrorText`, `usePermission`, `toastApiError`.
- Produces:
  - `saveBlob(blob: Blob, filename: string): void`
  - `ExportDialog({ open, onOpenChange, action, today, busy, error, onExport })` — `onExport: (range: DateRange) => void`

- [ ] **Step 1: The download helper**

Create `src/lib/utils/download.ts`:

```ts
/**
 * Hands a fetched Blob to the browser as a file. An anchor with `download` is the one mechanism
 * that works for a body fetched with a bearer token; the object URL is revoked after the click so a
 * long session does not accumulate CSVs in memory.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Deferred: revoking synchronously races the click in some browsers and yields an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 2: The dialog**

Create `src/features/audit/export-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import {
  defaultExportRange,
  explainInvalidExportRange,
  type DateRange,
} from '@/lib/settings/export';

/**
 * The audit trail as a file (F5-DESIGN D8).
 *
 * The range defaults to the last 30 days and is checked here against the API's own rule — inclusive,
 * `from ≤ to`, at most 366 days — so the common mistakes never become a round trip. Checking is not
 * trusting: a refusal from the API still renders below the fields. The dialog says plainly that the
 * export is itself an audit entry (`audit.exported`), because personal data leaving the system is
 * exactly the action the trail exists to record.
 */
export function ExportDialog({
  open,
  onOpenChange,
  action,
  today,
  busy,
  error,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list's current action-prefix filter, carried into the export unchanged. */
  action: string;
  /** Injected so the default range is testable against a fixed day. */
  today: Date;
  busy: boolean;
  error: unknown;
  onExport: (range: DateRange) => void;
}) {
  const [range, setRange] = useState<DateRange>(() => defaultExportRange(today));
  const problem = explainInvalidExportRange(range);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export audit log as CSV</DialogTitle>
          <DialogDescription>
            Nine columns per entry, oldest first; before/after values are not included. The export is
            recorded in the audit log with its filter and row count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {action ? (
            <>
              Filtered to actions starting <code className="font-mono">{action}</code>.
            </>
          ) : (
            'All actions.'
          )}
        </p>

        {problem && (
          <p id="export-range-error" role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <ApiErrorText error={error} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={problem !== null} loading={busy} onClick={() => onExport(range)}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: The button and the mutation on the page**

In `src/app/(admin)/audit-logs/page.tsx`:

```tsx
// new imports
import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportDialog } from '@/features/audit/export-dialog';
import { usePermission } from '@/lib/auth/session';
import { exportRangeToQuery, type DateRange } from '@/lib/settings/export';
import { saveBlob } from '@/lib/utils/download';

// inside AuditLogsPage, beside the other state
const canExport = usePermission('audit.export');
const [exporting, setExporting] = useState(false);

const exportCsv = useMutation({
  mutationFn: (range: DateRange) =>
    auditLogs.export({ ...exportRangeToQuery(range), action: debouncedAction || undefined }),
  onSuccess: (file) => {
    // The API names the file after the range (`audit-logs-<from>-<to>.csv`); the fallback only
    // matters if a proxy ever strips Content-Disposition.
    saveBlob(file.blob, file.filename ?? 'audit-logs.csv');
    setExporting(false);
  },
  // A refusal stays in the dialog under the fields; nothing to toast.
});
```

Give `PageHeader` an `actions` prop:

```tsx
actions={
  canExport ? (
    <Button variant="outline" onClick={() => setExporting(true)}>
      <Download className="size-4" aria-hidden />
      Export CSV
    </Button>
  ) : undefined
}
```

And render, next to `AuditEntryDialog`:

```tsx
{canExport && (
  <ExportDialog
    open={exporting}
    onOpenChange={(open) => {
      setExporting(open);
      if (!open) exportCsv.reset();
    }}
    action={debouncedAction}
    today={new Date()}
    busy={exportCsv.isPending}
    error={exportCsv.error}
    onExport={(range) => exportCsv.mutate(range)}
  />
)}
```

- [ ] **Step 4: Write the tests that pin the dialog**

Create `tests/unit/export-dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportDialog } from '@/features/audit/export-dialog';
import { ApiError } from '@/lib/api/problems';

const today = new Date('2026-09-20T12:00:00Z');

function renderDialog(overrides: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
  const onExport = vi.fn();
  render(
    <ExportDialog
      open
      onOpenChange={vi.fn()}
      action=""
      today={today}
      busy={false}
      error={null}
      onExport={onExport}
      {...overrides}
    />,
  );
  return onExport;
}

describe('ExportDialog (D8)', () => {
  it('opens on the last 30 days and exports that range', async () => {
    const onExport = renderDialog();

    expect(screen.getByLabelText('From')).toHaveValue('2026-08-22');
    expect(screen.getByLabelText('To')).toHaveValue('2026-09-20');

    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(onExport).toHaveBeenCalledWith({ from: '2026-08-22', to: '2026-09-20' });
  });

  it('refuses a range past 366 days before asking the API', async () => {
    const onExport = renderDialog();

    await userEvent.clear(screen.getByLabelText('From'));
    await userEvent.type(screen.getByLabelText('From'), '2025-01-01');

    expect(screen.getByRole('alert')).toHaveTextContent(/366/);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('names the current action filter it will carry', () => {
    renderDialog({ action: 'gym.' });

    expect(screen.getByText(/actions starting/)).toHaveTextContent('gym.');
  });

  it('says the export is itself recorded in the audit log', () => {
    renderDialog();

    expect(screen.getByText(/recorded in the audit log/)).toBeVisible();
  });

  it('still shows the API’s refusal, because a URL can be hand-edited', () => {
    renderDialog({
      error: new ApiError(400, 'audit.export_range', 'An audit export covers at most 366 days.', false),
    });

    expect(screen.getAllByRole('alert').some((node) => /366/.test(node.textContent ?? ''))).toBe(true);
  });
});
```

Run: `pnpm test export-dialog`
Expected: PASS, 5 tests.

- [ ] **Step 5: See it in the browser**

On `/audit-logs`, filter to `gym.`, click Export CSV, keep the default range, click Export. Expected: the browser saves `audit-logs-<yyyyMMdd>-<yyyyMMdd>.csv`; the first line is the nine-column header; `/audit-logs` then shows an `audit.exported` entry at the top.

- [ ] **Step 6: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
git add -A
git commit -m "Export CSV on the audit log, through the client, with the range rule mirrored"
```

---

### Task 12: The E2E journey, and the second account it needs

Implements the spec's §5 E2E requirement. The maintenance step needs a session the middleware refuses, and no existing spec creates a second account: invitations need an activation email and the test backend has email off. So `global-setup.ts` seeds one **by SQL**, the way it already seeds `daily_platform_stats` — copying the seeded SuperAdmin's password hash into a second, Active user holding the SupportAgent role. Argon2 verification depends only on the stored hash string, so the copy signs in with the same password.

**Files:**

- Create: `tests/e2e/seed-support-agent.sql`
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/operations-journey.spec.ts`
- Modify: `tests/e2e/README.md`

**Interfaces:**

- Consumes: the running stack per `tests/e2e/README.md`; the SuperAdmin `e2e@gymos.test` / `e2e-super-admin-password`.
- Produces: the account `e2e-support@gymos.test`, same password, role SupportAgent, status Active — idempotent across runs.

- [ ] **Step 1: The seed**

Create `tests/e2e/seed-support-agent.sql`:

```sql
-- A SupportAgent for operations-journey.spec.ts: the maintenance step must prove that a caller
-- without settings.manage is refused, and the SuperAdmin passes by design.
--
-- Password: copied from the seeded SuperAdmin (e2e@gymos.test), so the account signs in with
-- e2e-super-admin-password. Argon2 verification reads salt and parameters from the hash string
-- itself, so a copied hash verifies for a different user. Local test container only.
SET NOCOUNT ON;

DECLARE @hash nvarchar(500) = (
    SELECT TOP 1 password_hash FROM platform.users WHERE normalized_email = 'E2E@GYMOS.TEST');
IF @hash IS NULL
    THROW 50000, 'The seeded SuperAdmin e2e@gymos.test does not exist yet. Start the backend first (tests/e2e/README.md, step 2).', 1;

DECLARE @roleId uniqueidentifier = (
    SELECT TOP 1 id FROM platform.roles
    WHERE normalized_name = 'SUPPORTAGENT' AND scope = 1 AND tenant_id IS NULL);
IF @roleId IS NULL
    THROW 50000, 'The SupportAgent role is missing; the identity catalog sync has not run.', 1;

DECLARE @userId uniqueidentifier = (
    SELECT TOP 1 id FROM platform.users WHERE normalized_email = 'E2E-SUPPORT@GYMOS.TEST');

IF @userId IS NULL
BEGIN
    SET @userId = NEWID();
    INSERT INTO platform.users
        (id, email, normalized_email, password_hash, first_name, last_name, status,
         suspension_reason, failed_login_attempts, locked_out_until_utc, last_login_at_utc,
         password_changed_at_utc, security_stamp, created_at_utc, updated_at_utc)
    VALUES
        (@userId, 'e2e-support@gymos.test', 'E2E-SUPPORT@GYMOS.TEST', @hash, 'E2E', 'Support', 2,
         NULL, 0, NULL, NULL, SYSDATETIMEOFFSET(), NEWID(), SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
END
ELSE
    -- A previous run's lockout or password change must not fail this one.
    UPDATE platform.users
    SET password_hash = @hash, status = 2, failed_login_attempts = 0, locked_out_until_utc = NULL
    WHERE id = @userId;

IF NOT EXISTS (SELECT 1 FROM platform.user_roles
               WHERE user_id = @userId AND role_id = @roleId AND tenant_id IS NULL)
    INSERT INTO platform.user_roles (id, user_id, role_id, tenant_id)
    VALUES (NEWID(), @userId, @roleId, NULL);

SELECT COUNT(*) FROM platform.user_roles ur
JOIN platform.users u ON u.id = ur.user_id
WHERE u.normalized_email = 'E2E-SUPPORT@GYMOS.TEST' AND ur.role_id = @roleId;
```

`status = 2` is `UserStatus.Active`; `scope = 1` is `RoleScope.Platform` (both `short` on the wire — see `UserStatus.cs`, `RoleScope.cs`). Column names come from `20260823193125_InitialSqlServer.cs`; no later migration adds a column to `users`.

- [ ] **Step 2: Run it from global setup**

In `tests/e2e/global-setup.ts`, after the analytics verification and before the final `console.log`:

```ts
  // The SupportAgent operations-journey.spec.ts signs in as, to prove maintenance mode refuses a
  // caller without settings.manage. Seeded by SQL because an invitation needs an email the test
  // backend never sends. Idempotent; see seed-support-agent.sql.
  const support = sqlcmd(readFileSync(join(HERE, 'seed-support-agent.sql'), 'utf8')).trim();

  if (Number(support) !== 1) {
    throw new Error(
      `Expected exactly one SupportAgent role assignment for e2e-support@gymos.test, got '${support}'. ` +
        `See tests/e2e/seed-support-agent.sql.`,
    );
  }

  console.log('Seeded e2e-support@gymos.test as SupportAgent.');
```

Wrap the `sqlcmd` call in the same try/catch shape as the analytics seed, so a `THROW` from the SQL reads as "start the backend first" rather than a stack.

- [ ] **Step 3: The journey**

Create `tests/e2e/operations-journey.spec.ts`. Copy `visibleText`, `signIn`, `openNavLink`, `FIRST_LOAD` and `SUPER_ADMIN` from `feature-flags-journey.spec.ts` (each spec stays self-contained). Add:

```ts
const SUPPORT_AGENT = { email: 'e2e-support@gymos.test', password: SUPER_ADMIN.password };
const runId = `${Date.now()}`.slice(-8);

/** Every job the host registers when Jobs__Enabled=false is still described to the API. */
const REGISTERED_JOBS = [
  'feature-override-sweep',
  'invoice-overdue',
  'platform-stats',
  'subscription-renewal',
  'retention',
];
```

Then `test.describe.serial('operations journey', …)` with these tests, in this order:

1. **Monitoring lists every registered job as not yet run.** Sign in, `openNavLink(page, isMobile, 'Monitoring')`, expect the level-1 heading `Monitoring` (`FIRST_LOAD`). For each name in `REGISTERED_JOBS`, expect `visibleText(page, name).first()` visible. Expect `visibleText(page, 'Has not run yet')` to have count `REGISTERED_JOBS.length` — the test backend runs with `Jobs__Enabled=false`, and a fresh container has no history. Expect the outbox note `Depth only. Delivery lag and dead letters are reported once the outbox processor exists.` visible, and `visibleText(page, 'Healthy').first()` visible.

2. **A job's history opens and explains its emptiness.** From Monitoring, click `visibleText(page, 'retention').first()`; expect the level-1 heading `retention`; expect `No runs recorded` visible; expect the `Status` combobox visible.

3. **A General setting moves to Database and back to Default.** `openNavLink(page, isMobile, 'Settings')`; the `Platform name` input; read its value into `original`; fill `${original} ${runId}`; click `Save`; expect toast `Settings saved.`; expect `visibleText(page, 'Database').first()` visible. Click `Reset to default`, `Save`, expect `Settings saved.`, expect the `Platform name` input to have value `GymOS` and `Database` to have count 0 on the General tab.

4. **Test connection reports the API's own refusal.** Click the `Email` tab, click `Test connection`, expect `visibleText(page, /Email is disabled; enable it and save before testing the connection\./)` visible — the API's sentence, unmapped by design. This needs `email.enabled` to be false on the test backend; if `appsettings.Development.json` turns email on, add `Email__Enabled=false` to the README's backend command and say so in the README.

5. **Maintenance refuses a SupportAgent and reopens afterwards.** Structured as `try { … } finally { … }`:
   - Enable: on `/settings`, click `Enable maintenance mode`; fill `Message shown to refused callers` with `E2E maintenance ${runId}`; fill the `Type maintenance to confirm` field with `maintenance`; click the dialog's `Enable maintenance mode`; expect toast `Maintenance mode is on.`; expect `getByRole('status')` to contain `Maintenance mode is on.` (the banner, immediate).
   - Refused: `const context = await browser.newContext(); const other = await context.newPage();` sign in as `SUPPORT_AGENT` **without** asserting the dashboard URL (the notice replaces it); expect `other.getByRole('alert')` to contain `Maintenance in progress` and `E2E maintenance ${runId}` (`FIRST_LOAD`); `await context.close()`.
   - `finally`: on `page`, `await page.goto('/settings')`; if `getByRole('button', { name: 'Disable maintenance mode' })` is visible, click it, click the dialog's `Disable`, expect `Maintenance mode is off.`. This runs whether or not the assertions above passed, so a failed run cannot leave the shared backend closed for the mobile project that follows.
   - The test signature needs `{ page, browser, isMobile }`.

6. **Export downloads a CSV with the header line.** `openNavLink(page, isMobile, 'Audit log')`; fill `Filter by action` with `settings.`; click `Export CSV`; expect the dialog to contain `recorded in the audit log`; `const downloadPromise = page.waitForEvent('download')`; click the dialog's `Export`; `const download = await downloadPromise`; expect `download.suggestedFilename()` to match `/^audit-logs-\d{8}-\d{8}\.csv$/`; read the stream:

   ```ts
   const stream = await download.createReadStream();
   const chunks: Buffer[] = [];
   for await (const chunk of stream) chunks.push(Buffer.from(chunk));
   const [header] = Buffer.concat(chunks).toString('utf8').split('\r\n');
   expect(header).toBe(
     'id,created_at_utc,user_email,user_id,ip_address,action,entity_type,entity_id,correlation_id',
   );
   ```

   Then reload `/audit-logs`, filter `audit.`, expect `visibleText(page, 'audit.exported').first()` visible — the export recorded itself.

Every nav hop goes through `openNavLink`; every `Save`/`Export`/dialog button click uses `getByRole` scoped to `page.getByRole('dialog')` where a dialog is open. If a left-aligned `Save` is unreachable on mobile behind the dev-tools indicator, reuse `clickSave` from `feature-flags-journey.spec.ts` with its comment.

- [ ] **Step 4: Update the README**

Append to `tests/e2e/README.md` §3 a paragraph headed **A second account, seeded for you**: what `seed-support-agent.sql` creates, why by SQL (email is off, so an invitation cannot be activated), that the password is the SuperAdmin's, and that it is local-container-only. Append to §5: `operations-journey.spec.ts` edits `general.platform_name` and resets it, turns maintenance mode on and off (restored in a `finally`), and leaves `audit.exported` entries behind; none needs cleanup.

- [ ] **Step 5: Run it on desktop**

Run: `pnpm exec playwright test operations-journey --project=desktop --reporter=list`
Expected: 6 passed. A failure in step 5's refused-caller assertion most often means the seed did not run — check global setup's log line.

- [ ] **Step 6: Run it on mobile**

Run: `pnpm exec playwright test operations-journey --project=mobile --reporter=list`
Expected: 6 passed. A timeout on a nav link means a missing drawer branch.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm exec playwright test --reporter=list`
Expected: every spec passes, **zero skips**. The suite was 66 tests before F5; expect 78.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "F5 end to end: monitoring, settings, maintenance refusing a SupportAgent, and a real CSV download

The SupportAgent is seeded by SQL in global setup, copying the seeded
SuperAdmin's hash, because email is off and an invitation cannot be
activated. Maintenance is restored in a finally."
```

---

### Task 13: Close out

**Files:**

- Modify: `GymOS-Backend/docs/STATUS.md`

- [ ] **Step 1: Run every gate one final time**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
pnpm exec playwright test --reporter=list
```

Record the exact numbers. Do not round or estimate them.

- [ ] **Step 2: Update STATUS.md**

In `GymOS-Backend/docs/STATUS.md`: add an **F5 — operations console** row to the milestone table directly after the F4 row (search for `| **F4 — feature flags console**`), in that row's style: what it built, the unit and E2E counts before and after, "review owed", and the paths of the design and this plan. Update the top **Last updated** line and the top-of-file "Resume here" paragraph: F5 built, its review owed, `F5-AS-BUILT.md` deliberately unwritten until that review (the convention F3 and F4 set), the `gen:api` diff's four groups accounted for. Note that the console is now complete relative to the backend, and that the `/navigation` endpoint and the F3 as-built remain owed as before.

- [ ] **Step 3: Commit**

```bash
git -C /c/Work/Personal-Projects/GymOS/GymOS-Backend add docs/STATUS.md
git -C /c/Work/Personal-Projects/GymOS/GymOS-Backend commit -m "STATUS records F5 as built, review owed"
```

Push only when the owner asks — they have kept that call for themselves on every increment.

---

## Notes for the executor

- **`F5-AS-BUILT.md` is not part of this plan.** It is written after F5's review, so it records what the review changed.
- **Read the regenerated types before writing against them.** The `number | string` unions on every integer are real; `formatDuration` and friends exist so no screen coerces them itself.
- **Do not add a `Switch` component.** `Bool` renders through the existing `Select` (D11); a new primitive is a new decision.
- **If a task reveals the spec is wrong**, stop and say so rather than implementing around it. `F5-DESIGN.md` is the spec; `Monitoring.md` and `Settings.md` outrank it; the running API outranks all three.
- **The maintenance E2E flips shared backend state.** It restores in a `finally`, and the suite is serial with one worker; if a run is killed mid-test, disable maintenance mode by hand from the SuperAdmin session before the next run.
- **Owed work outside F5's scope**: the F3 and activation-console reviews, `F3-AS-BUILT.md`, the `/navigation` endpoint. None is touched here.
