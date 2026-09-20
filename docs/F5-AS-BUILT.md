# F5 — as built

What differs from [`F5-DESIGN.md`](F5-DESIGN.md), and what building it taught. The design document
stands as written except where execution or its review corrected it; this records the decisions taken
with a keyboard rather than on paper, the whole-branch review's findings and the fix wave, and what was
deliberately left.

## Everything in the design landed

Scope matches §2: `/monitoring` with health rows, the process tile, the outbox tile and the jobs table
polled every 60 s; `/monitoring/jobs/[name]` with its status filter and "Load older" cursor; `/settings`
with its General/Email/Security/Retention tabs rendered from the catalogue by type, a Maintenance
section, and a test-email probe; maintenance mode as a confirmed toggle, a shell banner and a 503
interception; Export CSV on `/audit-logs` behind `audit.export`; Monitoring and Settings joined to the
navigation in the order ARCHITECTURE §5 fixes. Nineteen commits on `development`,
`c7c0e5f..5ebb5cd`, not pushed — pushing is the owner's call, as on every prior increment.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, **322 unit tests** across 48 files (was
210 across 32 before F5), and **78 E2E tests** — 0 failed, 0 skipped, across both desktop and mobile
viewports (was 66 before F5), 2.1 minutes.

### The `gen:api` diff, read rather than accepted

`+714/−40` lines in `src/types/api.d.ts`, in exactly four groups, as Task 1 required: the monitoring
paths and schemas; the settings paths and schemas; `/audit-logs/export`; and H1's
`ActivityEntry.entityType` becoming nullable. No fifth group appeared. `describeEntityType` already
tolerated a null entity type, so that change needed no console code at all — it was read and dismissed
on its own facts rather than assumed safe.

## Decisions taken while building

### D1 — Monitoring stayed its own screen

Built as designed: SupportAgent holds `monitoring.read` and not `analytics.read`, so folding the jobs
table into the dashboard would have hidden it from the one role the console most needs to show it to.

### D2 — Staleness is rendered, never computed

The `stale` flag comes from the API on every row; a job with no run at all shows "Has not run yet"
rather than a computed stale state. Error text is shown exactly as sent, unmodified, matching
Monitoring.md §2's own trimming.

### D3 — The process and outbox tiles say what they are, and gained a shared shell

Built as designed, with one addition the review made: the process tile's `Metric` and the outbox
tile's `Figure` were byte-identical. Extracted into one `Figure` in
`src/features/monitoring/figure.tsx`; the audit page's unrelated `Fact` was left alone.

### D4 — Run history pages by the cursor `hasMore` defines

"Load older" re-queries with `to` set to the oldest `startedAtUtc` already received. `nextRunsCursor`
originally compared those timestamps as ISO strings lexically; the review moved it to a `Date.parse`
comparison, functionally identical for well-formed timestamps but correct in a way that does not
depend on that assumption holding.

### D5 — Settings render from the catalogue, by type — no `Switch` added

`String` → text, `Int` → number, `Bool` → the existing `Select` (D11 in both designs: a new primitive
is a new decision, and none was taken here). Each row shows `source`, `description`, and a warning
when `valid` is false, exactly as specified.

### D6 — Save sends only what changed, and the masked-password bug the review caught

`settingsDiff(original, draft)` sends `{ category, values }` for changed keys only; "Reset to default"
sends `null`; a 409 reloads with a message naming a concurrent save. Built as designed, but the
"Replace value" affordance on a sensitive row had a bug the per-task reviews had no way to see: opening
it left the input pre-filled with the `••••` mask rather than empty, so an operator who typed a secret
without first clearing the field stored `••••<secret>`, and because the value is sensitive nobody could
see what had actually landed. The final review's Important 1 fixed it — the input now always opens
empty when it was showing the mask — and a test now types into it _without_ clearing first, which
would have failed against the old code.

The extraction the same finding asked for: the settings page's `onError` decision (409 → conflict
banner and reload, versus an inline field error) is now `describeSaveFailure(error)` in
`src/lib/settings/save-failure.ts`, unit-tested directly rather than only through the panel.

### D7 — Maintenance is confirmed, and gained a `children` slot the plan had placed unreachably

Enable is `DestructiveConfirmDialog` typing `maintenance`; disable is a plain `ConfirmDialog`; the
banner polls `GET /settings?category=Maintenance` every 60 s for holders of `settings.read`, and
everyone else meets the client's 503 interception as a full-page notice. One correction during
execution: the plan placed the maintenance message textarea outside the confirmation modal, which in a
real browser is unreachable once the modal opens beneath it. `DestructiveConfirmDialog` gained an
optional `children` prop, rendered between the description and the typed field (mirroring
`ConfirmDialog`'s own shape), and `MaintenanceSection` renders the textarea as that child, inside the
modal.

The review also found the enable dialog's refusal message stayed visible if the dialog was closed and
reopened; `MaintenanceSection` now takes an `onEnableDialogClose` callback that clears it, and the pure
`maintenanceState` rule the banner and the section both need moved out of a `'use client'` file into
`src/lib/settings/maintenance.ts`, per D10.

### D8 — Export is a dialog with a bounded range and a real download

`api.download(path)` sends the bearer token, returns a Blob and reads the filename from
`Content-Disposition`; an anchor click saves it. Built as designed. Left as recorded rather than
fixed: `exportRangeToQuery`'s end bound is sent as `T23:59:59Z`, a sub-second gap against a literal
midnight on the last day of the range — noted here per the review's ruling, not changed.

### D9 — Permissions hide, the API authorises

Built as designed and unit-tested per role: `monitoring.read` (SuperAdmin, PlatformAdmin, SupportAgent,
ReadOnly), `settings.read` (SuperAdmin, PlatformAdmin, ReadOnly), `settings.manage` (SuperAdmin only),
`audit.export` (SuperAdmin, PlatformAdmin).

### D10 — Rules that could rot are pure functions

`src/lib/monitoring/` (run cursor, duration/uptime formatting, job-state presentation) and
`src/lib/settings/` (`settingsDiff`, per-type client validation, export range rule, `Content-Disposition`
filename parse, and, after the review, `maintenanceState` and `describeSaveFailure`). Two corrections
during execution belong here:

- **`formatDuration`/`formatSeconds` rounded without carrying the remainder** — a plan-mandated defect,
  not an implementation slip. `59:59.999` rounded to `60` minutes rather than carrying to the next
  hour. Fixed by flooring the remainder instead of rounding it, with boundary tests at `3_599_999 ms`
  (59 min 59 s, not 60) and `7_199_999 ms` (1 h 59 min, not 2 h).
- **The outbox tile's counts went through an inline `String()`** on wire integers, which the plan
  specified directly and which violates the repo's one-coercion-point convention for numbers arriving
  as `number | string`. Replaced with `formatCount(value)` in `src/lib/monitoring/format.ts`
  (`toNumber` plus en-GB grouping), the same shape `formatMegabytes` already used.

### D11 — No new runtime dependency; British English; 375 px

Held throughout. `Bool` renders through `Select`, not a new `Switch`.

### The job-runs page does not `decodeURIComponent` its own route parameter

The plan's instruction to defensively decode `params.name` was not followed: Next's route matcher
already decodes dynamic segments before the page sees them, and `JobsTable` encodes the name exactly
once when it builds the link, so an additional decode on the receiving end would double-decode any job
name containing a literal percent sign. No such job name exists today, so the difference is invisible
in practice, but the plan's instruction was wrong and was not implemented as written.

## The whole-branch review, and the fix wave

Run over all nineteen commits at the most capable available effort, after every one of the thirteen
tasks had already had its own per-task review (Tasks 4 and 5 batched). Per-task fix rounds along the
way: Task 4's rounding carry (above), Task 7's `formatCount` extraction (above), and two rounds on
Task 12 covering the rate-limit README paragraphs, a leaked browser context, and the F4 race described
below.

The whole-branch pass found **0 Critical, 2 Important, 10 Minor**, and judged the branch "ready with
fixes". One fix wave, `5ebb5cd`, addressed both Important findings and eight of the ten Minor ones; a
scoped re-review confirmed all addressed findings and no new breakage.

- **Important 1** — the masked-password bug on "Replace value", above (D6).
- **Important 2** — `MaintenanceBanner`, `MaintenanceGate`, `saveBlob` and the settings 409 decision
  had no unit tests at all, despite each being load-bearing and named in the design's own §5 test
  list. Added: `maintenance-banner.test.tsx` (permission-gated fetch, three cases), `maintenance-gate.
test.tsx` (a real 503 through a mocked `fetch`, first-error-wins, handler cleared on unmount),
  `download.test.ts` (anchor click and delayed revoke under fake timers), and
  `settings-save-failure.test.ts` for the extracted `describeSaveFailure`.
- **Minors fixed**: a `<p>` as a direct child of `<dl>` on the process tile, wrapped in a `<div>`; the
  shared `Figure` extraction (D3); `maintenanceState` moved to `src/lib/settings/maintenance.ts` (D7);
  the enable dialog's error cleared on close (D7); the `settings.setMaintenanceMode` JSDoc now states
  the enable/disable header asymmetry in one sentence; a bare `<span aria-label>` replaced with
  sr-only text beside the mask; the seed SQL's `scope`/`status` enum literals commented with their
  named values; `nextRunsCursor` moved to a `Date.parse` comparison (D4).
- **Left as recorded, not fixed**: the export's `T23:59:59Z` end bound (D8); the client's `send`
  always setting `Accept: application/json`, which is harmless against the current `Results.Stream`
  response and would only matter against a future content-negotiating endpoint.

## Controller rulings during execution

Recorded in full in `.superpowers/sdd/2026-09-20-f5-operations-console/progress.md` (lines containing
`Ruling:`); the ones that changed what shipped, beyond the D-by-D corrections above:

- **`DestructiveConfirmDialog` gained `children`** because the plan's placement of the maintenance
  message field outside the modal was unreachable once the modal opened (D7, above).
- **The rounding fix floors rather than rounds** (D10, above) — a plan defect, not a spec defect.
- **`formatCount` replaced an inline `String()`** on the outbox tile (D10, above).
- **The job-runs page does not `decodeURIComponent`** its route parameter, against the plan's
  instruction (above).
- **`describeSaveFailure` was extracted** as a pure helper rather than tested only through the settings
  page, per the review's own stated preference for that option.
- **Rate limits were raised on the test backend only** (anonymous 5000/min, authenticated 100000/min),
  with README paragraphs naming the production defaults and why the suite trips them at its own scale.
- **The F4 feature-flags E2E now awaits the plan-features `PUT`** rather than asserting on optimistic
  local state, because under suite load the page could close and cancel the write before the server
  responded, which a lightly loaded solo run never showed.
- **`F5-AS-BUILT.md` is written now**, in this task, rather than left owed: the design's definition of
  done names it "after the review", and the whole-branch review has since run and its fix wave has
  landed.

## E2E environment facts discovered building this increment

All now recorded in `tests/e2e/README.md`:

- The backend's compose stack creates a database named `GymOS_Local`, not `gymos`.
- `localhost` resolved to IPv6 on the machine this was built on and timed out; the connection string
  and every `docker exec`/`sqlcmd` call now target `127.0.0.1,1433` explicitly.
- `Email__Enabled=false` is required for the test-email spec's assertion on the API's own
  disabled-sender refusal.
- Two _global_ rate limiters, added by M7 on top of the existing sign-in policy, throttle the suite at
  its own scale rather than at production scale: `security.anonymous_requests_per_minute` (default
  60/min/IP, tripped by the login/refresh traffic of dozens of fresh sessions) and
  `security.api_requests_per_minute` (default 600/min/user, tripped by one shared session running
  several queries per screen across seventy-plus tests). Both symptoms were confusing before they were
  understood — a silent session loss with a 30 s timeout, and a screen rendering the API's own
  rate-limit sentence — and both are raised on the test instance only.
- `global-setup.ts` seeds a second account by SQL: `tests/e2e/seed-support-agent.sql` creates (or
  repairs) an Active, platform-scoped SupportAgent by copying the seeded SuperAdmin's own
  `password_hash` onto the new row, because inviting an administrator normally emails an activation
  link and this backend runs with email off. Argon2 verification reads its salt and parameters from
  the hash string itself, so the copied hash verifies for the different account. This is what lets
  `operations-journey.spec.ts` prove that maintenance mode refuses a caller without `settings.manage`
  — something the seeded SuperAdmin can never demonstrate, since SuperAdmins always pass (D7).

## Observations for whoever picks this up

These are outside F5's scope and nothing here fixes them; they are recorded because building F5 is
what surfaced them.

- **The backend logs a client-cancelled request as an HTTP 500.** When a browser navigates away
  mid-request, `TenantSessionInterceptor.WriteTenantAsync` logs `SqlException: Operation cancelled by
user` as a 500 — 122 occurrences in one session's log during this increment's own E2E runs. These
  will read as false errors in Application Insights and should map to a cancelled-request status
  instead.
- **F4's `PlanFeaturesList` still renders `aria-pressed` from optimistic local state.** This
  increment's E2E fix made the F4 journey spec await the `PUT` before asserting, so the suite no
  longer sees the race — but the console itself is unchanged: a failed save still leaves the buttons
  claiming a state the server never stored.
- **Settings.md §13's 30 s cross-replica settings TTL is real for the maintenance banner too.** On a
  multi-replica UAT, the banner or the 503 notice can lag up to 30 s behind an administrator's own
  change, and the process tile's `instance` label may alternate between polls when several replicas
  are live — the label discloses this rather than hiding it, but it is worth knowing before reading
  two consecutive polls as a health problem.
- **`GymOS/Platform-Recovery-Developer.txt` still holds a live SuperAdmin password.** Discovered while
  working in the same area as the seeded accounts above; it should be rotated.
- **Owed as before, untouched by F5**: the F3 review and `F3-AS-BUILT.md`, the activation-console
  review, and the `GET /navigation` endpoint.

## Post-review fix: signing out during maintenance

Manual testing after the review found a trap: a signed-in caller without `settings.manage` who hit
the maintenance notice had only "Try again", which reloads — and a reload exchanges the httpOnly
refresh cookie for a new token, the profile call is refused the same way, and the notice replaces the
page again, including the login page. There was no way for that caller to sign out and let a
SuperAdmin sign in instead.

The fix is two-sided. On the console, `MaintenanceNotice` gained a `Sign out` button that calls
`auth.signOut()` and then navigates with `window.location.assign('/login')` in a `finally`, so the
caller lands on the login form whether or not the logout call itself succeeds — a full navigation
because the gate's `blocked` state and every query cache need to be gone, not just the visible screen.
On the backend, `POST /api/v1/auth/logout` is now always allowed during maintenance, so the request
this button makes is never itself the thing refusing the caller. `tests/e2e/operations-journey.spec.ts`
covers the fix: after the notice appears for the second account, it clicks `Sign out` and asserts the
browser reaches `/login` with the Email field visible.
