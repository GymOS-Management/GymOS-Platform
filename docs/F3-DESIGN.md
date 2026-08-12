# F3 — Dashboard & analytics

**Status:** **approved 2026-08-12**, not yet built.
**Predecessors:** [`F1-DESIGN.md`](F1-DESIGN.md) / [`F1-AS-BUILT.md`](F1-AS-BUILT.md) ·
[`F2-DESIGN.md`](F2-DESIGN.md) / [`F2-AS-BUILT.md`](F2-AS-BUILT.md).
**Backend it consumes:** M5, merged and contract-frozen. Its rules as built are
`GymOS-Backend/docs/BusinessRules/Analytics.md` — **that document is authoritative over this one's
paraphrase of it**, and every honesty rule below is taken from it rather than invented here.

## 1. What F3 is

F1 was the frontend share of M0–M2; F2 was the frontend share of M3. **F3 is the frontend share of
M5** — the dashboard the console has deliberately not had, and the three analytics series behind it.

Both predecessors refused to build it, for the same stated reason. F1 wrote it into the code:

> `LANDING_ROUTE = '/gyms'` — _Not a dashboard: its figures come from M5's stats jobs, and a grid of
> zeroes teaches operators to distrust the screen._

That dependency has landed. F3 discharges the deferral, and flipping `LANDING_ROUTE` to `/dashboard`
— with that comment rewritten rather than deleted — is part of this increment, not a follow-up.

**Six operations, all shipped and contract-frozen.** F1 consumed twenty, F2 twenty. F3 is a much
smaller API surface and a much larger _presentation_ problem: every one of these numbers can be drawn
in a way that lies.

## 2. Scope

### In

| Screen                                         | Route                | API it consumes                                  | Why it earns its place                                                                     |
| ---------------------------------------------- | -------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Dashboard** — KPI row, MRR, health, activity | `/dashboard`         | `GET /dashboard/summary`, `/health`, `/activity` | The first screen after sign-in should answer "is the platform all right?" without a click. |
| **Analytics → Revenue**                        | `/analytics/revenue` | `GET /analytics/revenue`                         | MRR over time is the platform's own headline number.                                       |
| **Analytics → Growth**                         | `/analytics/growth`  | `GET /analytics/gyms-growth`                     | Tenant population and acquisition, which the dashboard shows only as of today.             |
| **Analytics → Churn**                          | `/analytics/churn`   | `GET /analytics/churn`                           | The only one of the three that is actionable, because it keeps _why_ attached.             |

### Out, and why

- **Anything M5 deferred for lack of a source** — members, staff, storage, API requests, devices,
  `/analytics/active-users`, `/api-usage`, `/storage`, `/monitoring/*`. `Analytics.md` §10 lists each
  with the dependency it waits on. Rendering an empty panel for them repeats exactly the mistake F1
  refused to make.
- **A summed, cross-currency MRR figure.** Not deferred — **refused**, permanently. See D2.
- **Server-side `granularity` rollups.** Not implemented backend-side (§7), and a client-side weekly
  sum is a sum over days the endpoint already returns. Not built until someone asks.
- **CSV/PDF export.** No operator has asked, and the table view (D9) already makes every number
  copyable.
- **Feature-flag filtering** and the **`/navigation`-driven sidebar** — still F1's deferrals,
  unchanged, and F4's dependency respectively.

## 3. No prerequisite this time

F2 opened with a backend prerequisite: the contract did not declare the headers it enforced. F3 has
none. The six operations are plain authenticated `GET`s with query parameters that `openapi-typescript`
already generates correctly, and M5's own review recorded its two deviations from the frozen spec in
`Analytics.md` rather than leaving them for a client to discover.

**One contract property is worth stating because it looks like a placeholder and is not:** `mrr` is a
JSON **array** of `{ amount, currency }` on both `/dashboard/summary` and `/analytics/revenue`, and
`Analytics.md` §4 is explicit that this is **permanent** — AD-43 will add a converted total _alongside_
the array, never replace it. A client written as though the array will one day collapse to a scalar is
written against a contract that is not going to arrive.

## 4. The decisions that shape the build

### D1 — Charts are owned SVG components; no charting library

`DEPENDENCY_POLICY.md` rule 3 is "prefer the platform… no component megalibrary while shadcn-style
primitives are generated into the repo and owned." F1 and F2 each shipped with **zero** new runtime
dependencies. F3 needs three chart forms — a line, a stacked area/bar, and a grouped stacked bar — over
at most 366 daily points.

Recharts is the shadcn pairing and is MIT (so the licence rule is not what decides this); it also pulls
a dozen `d3-*` packages into a tree the policy says a direct dependency must justify. Three forms this
simple do not justify it. They are drawn as owned components in `src/components/charts/`, on the same
terms as the owned `DataTable`.

**The trade-off, stated plainly:** we own the axis maths, the tooltip, the keyboard path, and the
responsive behaviour, and those are exactly the parts a library gets right for free. The mitigation is
that the forms are fixed and few, and that D9's table view is a genuine fallback rather than a
checkbox. **If the implementation of the hover/keyboard layer runs past its task budget, adding
Recharts is the sanctioned fallback** — it changes `DEPENDENCY_POLICY.md` and
`scripts/check-dependencies.mjs` in the same commit, per the policy's own rule.

### D2 — MRR is never summed across currencies, so revenue is small multiples

`Analytics.md` §4: MRR is computed **per currency and never coerced into one number**, because summing
unlike currencies needs an exchange-rate policy (AD-43) nobody has decided.

Two consequences, and the second is the one that shapes a screen:

1. **The dashboard shows one MRR figure per currency**, side by side, each labelled with its code. Not
   a single total. If the platform has three currencies, there are three figures.
2. **The revenue chart is one chart per currency, stacked vertically** — small multiples — not three
   series on one axis. Two currencies are two different units, and putting them on a shared y-axis is
   the dual-axis mistake wearing a disguise: €120 and ¥120 would be drawn at the same height while
   meaning nothing alike. Each chart carries its own axis, formatted by `formatMoney` (F2 D2), which
   already derives minor units from the currency code.

**`mrr` can be an empty array** — a platform with no paying subscription. That renders as an explicit
"No paying subscriptions" empty state, never as `€0.00`, because zero and _nothing to report_ are
different facts.

### D3 — A gap in the series is drawn as a gap

This is the single most important rule in F3, and it comes straight from the backend
(`Analytics.md` §2):

> A missing day returned as zeros draws a chart to the floor and reads as "every gym vanished that
> night." `/analytics/*` returns only the days that exist.

The backend went to the trouble of _not_ zero-filling and pinned it with a test
(`AGapInTheSeriesIsReturnedAsAGapAndNeverAsZeros`). A client that builds a continuous date axis and
defaults the missing days to `0` throws that away and produces precisely the lie the backend refused
to tell.

So: **the client never interpolates and never zero-fills.** The x-axis is continuous by date, the line
**breaks** across a missing day, and any range containing gaps carries a note naming how many days are
missing — a gap is a fact about the platform's uptime, not a rendering artefact. The stat is derived
from the dates actually returned, never from `to - from`.

### D4 — Population and event counts never share an axis

`Analytics.md` §3 keeps two families apart on purpose, and they are **not reconcilable**: population
counts exclude deleted gyms; event counts include them, because a gym created and deleted the same day
is still one created. That asymmetry is deliberate, was an owner ruling mid-increment, and is pinned by
`ADeletedGymLeavesThePopulationButStillCountsAsChurn`.

Drawing `newGyms` as a fourth line beside `total/active/suspended` invites a reader to check that the
population moved by the number of new gyms. It will not, and nothing on the chart would explain why.

So **Growth is two charts on one screen**:

- **Population** — a stacked area of `active` / `suspended` / `provisioning`, whose stack height _is_
  `totalGyms`. Three series, and the stack is the honest form because the parts genuinely sum to the
  whole (`provisioningGyms` exists in the response precisely so that they reconcile — §3).
- **New gyms** — a column chart underneath, on its own axis, labelled as an event count.

Each carries a one-line note saying which family it belongs to.

### D5 — Churn keeps its causes apart, and admits its alignment is approximate

`canceled` and `expired` are drawn as a **stacked column** per day (2px surface gap between segments),
with `total` available in the tooltip and the table rather than as a third mark. The first question of
a churn chart is _why_ — a product problem or a payments problem — and that is the whole reason M5
refused the frozen spec's single `churned_gyms` column.

**The screen carries M5's two recorded limitations** (`Analytics.md` §11) as a footnote, not buried in
a doc nobody opens:

- the two columns key on **different clocks** (`CanceledAtUtc`, a real moment; `CurrentPeriodEndUtc`, a
  business date), so day-by-day correlation between them is approximate;
- an expiry recorded late by `RenewalJob` is **lost from the series permanently**, so a low `expired`
  count is not proof of a low expiry rate.

A chart that presents two differently-clocked numbers as symmetric without saying so is the honest-
looking kind of wrong. The fix is one sentence on the screen.

### D6 — The dashboard degrades panel by panel, because its panels have different permissions

`/dashboard/activity` is gated on **`audit.read`**, while summary, health, and all three analytics
endpoints need **`analytics.read`** — and `Analytics.md` §6 records that this is a decision, not an
oversight: **SupportAgent deliberately holds `audit.read` and not `analytics.read`**, because answering
"why is POS off for this gym?" does not require seeing what the platform earns.

So a SupportAgent opening `/dashboard` must get a working activity feed and no revenue — which means
**each panel resolves its own permission and renders or omits itself**, rather than the page guarding
once at the top. A page-level guard would either lock a support agent out of a screen they are entitled
to half of, or show them figures the backend will refuse anyway.

Per F1's standing rule, `usePermission()` hides UI and never authorizes; every panel's API call is
re-checked server-side at both layers.

`LANDING_ROUTE` therefore also needs care: it becomes `/dashboard`, but a role with neither permission
would land on an empty screen. The landing route resolves to `/dashboard` when the caller holds either
permission and falls back to `/gyms` otherwise.

### D7 — The screen says which numbers are live and which are recorded

`Analytics.md` §1: the dashboard summary is computed **live** from `gyms` and `gym_subscriptions`;
the analytics series read **only** the nightly `daily_platform_stats`. So assigning a gym moves the
dashboard tile **immediately** and moves no chart until the next night's job has run.

That is correct and permanent, and it will look like a bug to every operator who notices it. Both
surfaces are labelled: the KPI row reads **"as of now"**, each chart reads **"recorded nightly · last
point <date>"**. One sentence prevents the support ticket.

### D8 — The range control clamps to what the API accepts, and still handles the refusal

`from` and `to` are required; `to < from` and any inclusive span over **366 days** are
`analytics.range_invalid` (400). The control offers presets — last 7 / 30 / 90 days, month to date,
year to date — plus a custom range that **cannot select more than 366 days**.

Preventing the error client-side does not excuse handling it: the shared error surface renders
`analytics.range_invalid` like any other typed backend error, because a URL can be hand-edited and a
client that trusts its own validation is a client that shows a stack trace when someone does.

### D9 — Every chart has a table view, and it is not a courtesy

Each chart ships a **Chart / Table** toggle rendering the same data through F1's `DataTable`.

Three separate obligations converge on this being mandatory rather than nice:

1. The palette validator (§5) returns a **contrast WARN** for the light-mode aqua series at 2.82:1
   against the card surface — the skill's relief rule makes visible direct labels **or** a table view
   obligatory, not dismissable.
2. `DataTable` is already responsive at both viewports; a 366-point chart on a 375px screen is not.
3. It is the accessible path, and the one that lets an operator copy a number into an email.

### D10 — Chart colour is tokens, validated, with dark mode selected rather than flipped

Chart colours are **not** reused from the shadcn semantic tokens (`--primary` is a UI accent; a series
is a different job). F3 adds `--chart-1..3` plus chart chrome (grid, axis, muted ink) to
`globals.css`, defined explicitly for **both** themes — the repo already ships `next-themes`, and a
dark palette must be _stepped for the dark surface_, never an automatic inversion of the light one.

The values are the reference categorical palette's first three slots, **validated against this repo's
own card surfaces** rather than the skill's defaults (`oklch(1 0 0)` light, `oklch(0.185 0 0)` ≈
`#131313` dark):

| Slot | Light     | Dark      | Used for                            |
| ---- | --------- | --------- | ----------------------------------- |
| 1    | `#2a78d6` | `#3987e5` | MRR · active gyms · canceled        |
| 2    | `#eb6834` | `#d95926` | new gyms · suspended gyms · expired |
| 3    | `#1baf7a` | `#199e70` | provisioning gyms                   |

```
LIGHT (surface #ffffff, --pairs all)      DARK (surface #131313, --pairs all)
[PASS] Lightness band                     [PASS] Lightness band
[PASS] Chroma floor                       [PASS] Chroma floor
[PASS] CVD separation   worst ΔE 9.2      [PASS] CVD separation   worst ΔE 9.4
[PASS] Normal-vision    worst ΔE 24.0     [PASS] Normal-vision    worst ΔE 20.9
[WARN] Contrast         #1baf7a  2.82:1   [PASS] Contrast         all >= 3:1
```

**Three series is the cap, and it is load-bearing.** The first three slots are the ones that clear the
all-pairs gates in both modes; a fourth puts yellow beside orange and fails them. Every form in F3 is
designed to need at most three — which is why D4 splits Growth into two charts instead of drawing four
series on one.

**Status colours are separate and reserved** (`good` `#0ca30c`, `warning` `#fab219`, `serious`
`#ec835a`, `critical` `#d03b3b`) for the health panel only, never as a series colour, and always with
an icon **and** a text label so state is never carried by colour alone.

Any change to these values re-runs `scripts/validate_palette.js` for both modes. A palette nobody
validated is a palette nobody knows is readable.

### D11 — Live panels refetch on focus; recorded series do not

F2 D8 established the pattern: F1 set `refetchOnWindowFocus: false` globally, and billing queries
override it because M3.4's sweeps move state with nobody clicking.

- **`/dashboard/summary` and `/dashboard/health`**: `refetchOnWindowFocus: true`. They are live reads,
  and a stale "everything is healthy" is the worst thing this screen can show. Health additionally
  polls at **60s** while the tab is visible — it is the one panel whose entire purpose is to be current.
- **`/dashboard/activity`**: `refetchOnWindowFocus: true`, no polling.
- **`/analytics/*`**: no override and no polling. The underlying row is written once a night and never
  recomputed (§2); refetching it on every focus is load with no possible new answer. `staleTime` is
  raised to 5 minutes for these three.

## 5. Layout

```
src/app/(admin)/dashboard/page.tsx              KPI row, MRR, health, activity
src/app/(admin)/analytics/revenue/page.tsx      small multiples, one per currency (D2)
src/app/(admin)/analytics/growth/page.tsx       population stack + new-gyms columns (D4)
src/app/(admin)/analytics/churn/page.tsx        canceled/expired stack + caveat (D5)

src/components/charts/{line-chart,stacked-area-chart,column-chart}.tsx   owned SVG (D1)
src/components/charts/{chart-frame,chart-tooltip,chart-legend,chart-empty}.tsx
src/components/data/stat-tile.tsx               KPI tile: value + label, no sparkline yet

src/features/dashboard/{kpi-row,mrr-panel,health-panel,activity-feed}.tsx
src/features/analytics/{range-control,series-table,chart-table-toggle,gap-note}.tsx

src/lib/api/endpoints.ts    + 6 operations
src/lib/analytics/range.ts  presets, the 366-day clamp, date-range serialisation (D8)
src/lib/analytics/series.ts gap detection over returned dates — never a generated axis (D3)
src/lib/nav/items.ts        + Dashboard, Analytics; LANDING_ROUTE (D6)
src/app/globals.css         + chart tokens, both themes (D10)
src/types/api.d.ts          regenerated by `pnpm gen:api`
```

Reused from F1/F2 unchanged: `DataTable`, `StatusBadge`, `EmptyState`, `PageHeader`, `usePermission`,
`formatMoney`.

## 6. Testing

**Unit (vitest)**

- **The gap rule (D3)** — a series with a missing day yields a break, not a zero point; and the gap
  note counts the missing days correctly. This is F3's highest-value test: it is the rule most likely
  to be "helpfully" undone by a later contributor building a continuous axis.
- **MRR never sums (D2)** — a two-currency response renders two figures and two charts; no code path
  produces a combined total. An empty `mrr` array renders the empty state, not `0`.
- `formatMoney` already covers minor units (F2); F3 adds that the **chart axis** uses the same
  formatter, so a JPY axis has no decimals.
- **Range clamping (D8)** — 366 days is allowed, 367 is refused client-side, and a hand-edited
  over-range URL surfaces `analytics.range_invalid` rather than an unhandled error.
- **Panel-level permission (D6)** — `audit.read` without `analytics.read` renders the activity feed
  and neither the KPI row nor MRR; the reverse renders the KPI row and no feed. Both against the real
  `usePermission`.
- **Chart tokens resolve in both themes (D10)** — the dark values are not the light ones.

**E2E (Playwright, both viewports)**

Sign in → land on `/dashboard` → KPI row reflects the gyms the F2 journey created → open
Analytics → Revenue → the range control drives the request → toggle to the table view and read the
same numbers. Run at desktop and mobile per F1's responsive rule.

**Backed by a seeded backend.** The analytics screens need `daily_platform_stats` rows, which are
written by a nightly job — an E2E run cannot wait for 03:30 UTC. The suite seeds the read model
directly (including **a deliberate one-day gap**, so D3 is proved end to end and not only in a unit
test). Per F2's risk note, the backend under test runs with `Jobs:Enabled=false` so no sweep moves
state mid-run.

**Contract drift**: the existing CI step regenerates types from the backend snapshot and fails on a
diff.

## 7. Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check` clean.
- `pnpm test` and `pnpm test:e2e` green at both viewports.
- `node scripts/check-dependencies.mjs` clean — **no new runtime dependency expected** (D1). If the
  Recharts fallback is taken, `docs/DEPENDENCY_POLICY.md` and the check change in the same commit.
- `scripts/validate_palette.js` re-run for both modes if any chart token moved (D10).
- Verified against a running backend with real seeded history: a gym assigned in the UI moves the
  dashboard KPI **immediately** and moves no chart until a stats row exists — D7's claim, demonstrated
  rather than asserted.
- `F3-AS-BUILT.md` written, recording what changed during implementation, in F1/F2's format.

## 8. Deferred, with the dependency each waits on

| Deferred                                                | Waits on                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Members / staff / storage / API-request / device panels | The sources M5 lists in `Analytics.md` §10                                                                               |
| A single cross-currency MRR total                       | AD-43 — and even then, **alongside** the array, never replacing it (D2)                                                  |
| Server-side `granularity` rollups                       | A real consumer asking                                                                                                   |
| Sparklines on the KPI tiles                             | Wants a short series per tile; `/dashboard/summary` returns no history and a second request per tile is not worth it yet |
| Export (CSV/PDF)                                        | An operator asking; the table view (D9) covers copying today                                                             |
| `/monitoring/*` screens                                 | M6                                                                                                                       |
| Feature-flag filtering · `/navigation` sidebar          | M4 console (F4) · the `IModule` loader                                                                                   |

## 9. Risks

- **The honesty rules are the deliverable, and they are the easiest thing to lose.** D3 (gaps), D4
  (families), D5 (clocks), D7 (live vs recorded) all make the screen _less_ clean-looking than the
  version that quietly interpolates and merges. Every one is a rule the backend paid for with a test
  or an owner ruling. A reviewer should check these first.
- **D1 is the schedule risk.** Owned SVG charts are cheap until the hover, keyboard, and responsive
  layers; that is where a library earns its keep. The fallback is named and sanctioned so it is a
  decision, not a scramble.
- **Three-series cap is load-bearing (D10)**, not a preference. A future panel that wants a fourth
  series needs faceting or an "Other" fold, not a fourth colour.
- **The E2E suite now depends on seeded read-model rows.** If that seeding is skipped, the analytics
  specs pass vacuously against empty series — the failure mode is a green suite that tested nothing.
  The seed must assert its own rows exist before the specs run.
