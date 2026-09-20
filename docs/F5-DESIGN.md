# F5 — Operations console

**Status:** **approved 2026-09-20** (in conversation with the owner), not yet built; plan not yet written.
**Predecessors:** [`F1-DESIGN.md`](F1-DESIGN.md) · [`F2-DESIGN.md`](F2-DESIGN.md) · [`F3-DESIGN.md`](F3-DESIGN.md)
(as-built owed) · [`F4-DESIGN.md`](F4-DESIGN.md) / [`F4-AS-BUILT.md`](F4-AS-BUILT.md).
**Backend it consumes:** M6 Monitoring, M7 Settings & Hardening, and H1 (no new endpoints; one wire
change). Their rules as built are `GymOS-Backend/docs/BusinessRules/Monitoring.md` and
`Settings.md` — **those documents are authoritative over this one's paraphrase**.

## 1. What F5 is

F1–F4 gave the console every surface the backend offered up to M5. The backend has since gained
M6 (`/monitoring/*`), M7 (`/settings`, `/settings/test-email`, `/settings/maintenance-mode`,
`GET /audit-logs/export`), and H1 changed `ActivityEntry.entityType` to nullable. **F5 is the frontend
share of M6 and M7 together**, chosen as one increment so that after it the console is complete
relative to the backend. Devices and logs stay absent — no backend serves them.

## 2. Scope

### In

- **Prerequisite:** `pnpm gen:api` — 636 lines of drift (monitoring, settings, export paths; the
  nullable `entityType`, which `describeEntityType` already handles). The diff is read, not accepted.
- **`/monitoring`** — health rows, process tile, outbox tile, jobs table; polled every 60 s.
- **`/monitoring/jobs/[name]`** — run history with status filter and "Load older".
- **`/settings`** — tabs General · Email · Security · Retention; a Maintenance section; test-email.
- **Maintenance mode** — confirmed toggle; shell banner; 503 interception.
- **Export CSV** on `/audit-logs` behind `audit.export`.
- **Nav:** Monitoring after Administrators, Settings last (ARCHITECTURE §5). Landing route unchanged.

### Out, and why

Devices and logs (no backend). `GET /navigation` (no module loader). The owed F3 and
activation-console reviews (separate work). A "who is affected" count on maintenance mode (no contract).

## 3. Decisions

### D1 — Monitoring is its own screen, not dashboard panels
The dashboard is `analytics.read`; monitoring exists for SupportAgent, who holds `monitoring.read`
and not `analytics.read` (Monitoring.md §8).

### D2 — The console never computes staleness
`stale` is rendered from the API's flag (Monitoring.md §3). A job with no run shows "Has not run yet",
not stale. Error text is shown exactly as sent; the backend already trims it (§2).

### D3 — Process and outbox tiles say what they are
The process tile is labelled with `instance` and shows "Warming up" while `cpuPercent` is null (§6).
The outbox tile prints the API's `note` verbatim (§5).

### D4 — Run history pages by cursor
"Load older" re-queries with `to` = the oldest `startedAtUtc` received, as `hasMore` is defined (§7).
Status filter: Running / Succeeded / Failed / all.

### D5 — Settings render from the catalogue, by type
`String` → text, `Int` → number, `Bool` → an On/Off `Select` (no new dependency). Each row shows
`source` (Default / Configuration / Database), `description`, and a warning when `valid` is false.

### D6 — Save sends only what changed, per category
`PUT /settings` gets `{ category, values: [{ key, value }] }` for changed keys only; sending untouched
rows would flip their source to Database. "Reset to default" sends `null`. The mask `••••` is never
sent; a sensitive row exposes a "Replace value" affordance that swaps the mask for an input. Empty
string clears (Settings.md §4). A 409 says another administrator saved first and reloads.

### D7 — Maintenance is confirmed, and the banner has two feeds
Enable via `DestructiveConfirmDialog` typing `maintenance` → `POST /settings/maintenance-mode` with
`X-Confirm-Action: maintenance`; disable via `ConfirmDialog`. `PUT /settings` never carries the
Maintenance category (the API refuses it). Banner: holders of `settings.read` poll
`GET /settings?category=Maintenance` (60 s) and see a banner while they keep working if they pass;
everyone else meets `503 settings.maintenance` on the next request, which the client intercepts (as it
does a lost session) into a full-page "Maintenance in progress" notice with the message and retry time.

### D8 — Export is a dialog with a bounded range and a real download
Date range defaults to the last 30 days; client-side rule mirrors the API's (`from ≤ to`, ≤ 366 days,
message from `audit.export_range`). Carries the current action filter. `api.download(path)` sends the
bearer token, returns a Blob and the filename from `Content-Disposition`; an anchor click saves it.
The dialog states the export is itself recorded in the audit log.

### D9 — Permissions hide, the API authorises
`monitoring.read`: SuperAdmin, PlatformAdmin, SupportAgent, ReadOnly. `settings.read`: SuperAdmin,
PlatformAdmin, ReadOnly. `settings.manage`: SuperAdmin only — every write affordance hides without it
and the screen is read-only. `audit.export`: SuperAdmin, PlatformAdmin.

### D10 — Rules that could rot are pure functions
`src/lib/monitoring/`: run cursor, duration/uptime formatting, job-state presentation.
`src/lib/settings/`: `settingsDiff(original, draft)`, per-type client validation, export range rule,
`Content-Disposition` filename parse. Each unit-tested.

### D11 — No new runtime dependency; British English; 375 px works

## 4. Layout

```
/monitoring                       Health · Process (instance) · Outbox (note)
  Jobs: name · schedule · last run · last success · next due · Stale
/monitoring/jobs/[name]           [All|Running|Succeeded|Failed]  rows … [Load older]
/settings                         [General|Email|Security|Retention]  rows by type · Save
  Maintenance: state · message · [Enable maintenance mode] / [Disable]
  Email tab: [Test connection] → result card
/audit-logs                       … [Export CSV] → dialog (from/to, filter) → file
```

## 5. Testing

**Unit:** D2 (stale flag rendered, never computed; no-run copy), D4 (cursor), D6 (diff sends only
changes; mask never sent; null on reset), D7 (503 → notice; banner from polled category), D8 (range
rule, filename parse), D9 (each write affordance hidden without its permission), formatting.

**E2E:** `operations-journey.spec.ts`, both viewports, serial, every nav click with the `isMobile`
drawer branch. Monitoring lists the registered jobs as "Has not run yet" (the test backend runs with
`Jobs__Enabled=false`). Settings: change `general.platform_name`, see source Database, reset, see
Default. Test-email refused ("email disabled") shown as the API's message. Maintenance: enable →
banner → a SupportAgent session is blocked with the notice → disable in a `finally`. Export: the
download event with its filename and header line.

## 6. Definition of done

All surfaces built; `gen:api` diff read and explained in the as-built; unit tests above green;
`operations-journey` green on both viewports, zero skips; `pnpm typecheck && pnpm lint &&
pnpm format:check && pnpm test` clean; `F5-AS-BUILT.md` written after the review.

## 7. Risks

The maintenance E2E flips a shared backend's state — serial project and restore in `finally`.
Polling two endpoints per minute per open tab is deliberate and cheap. The regenerated contract
carries changes beyond this increment — read the diff.
