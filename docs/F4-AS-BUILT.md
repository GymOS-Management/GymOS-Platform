# F4 — as built

What differs from [`F4-DESIGN.md`](F4-DESIGN.md), and what building it taught. The design document
stands as written except where its review corrected it; this records the decisions taken with a
keyboard rather than on paper, and what the review found afterwards.

## Everything in the design landed

Scope matches §2: the catalogue at `/features` with editing, the `Features` tab on gym detail with
override editing, the `Features` card on plan detail with its three-state control, and the
`toastApiError` / `ApiErrorText` extraction. Six API operations consumed, none guessed — every DTO
shape was read from `src/types/api.d.ts` before the component using it was written, which is how four
plan defects were caught before any code depended on them.

Verified: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, **198 unit tests** across 31 files (was
140 across 22 before F4), and **66 E2E tests** — 33 per viewport, desktop and mobile, **zero skipped**
(was 42 before F4).

## Five things the design got wrong, corrected during the build

The design was written without touching the code, and five of its concrete instructions were wrong.
Each was caught by whoever was implementing it rather than by the design's own review, which is worth
recording as a fact about how much a paper design can verify.

1. **`Badge` takes `tone`, not `variant`.** The design's `SourceBadge` snippet used shadcn's default
   variant API; this repo's `Badge` exposes `tone: neutral | success | warning | danger | info |
outline`. Adapted to mirror `status-badge.tsx`'s `Record<string, Tone>` + `?? 'neutral'` fallback,
   which is the established idiom.
2. **The nav lives in `src/lib/nav/items.ts`**, not `app-shell.tsx`. `app-shell` only renders
   `NAV_ITEMS`; the design named the wrong file.
3. **`adoptionCount` / `overrideCount` are `null | number | string` on the wire**, not `number |
null`. The guard is an explicit `=== null || === undefined` check rather than a truthiness test,
   so a genuine `0` still renders while a null count is absent — D11 in both directions. A
   truthiness check would have satisfied the original test and silently hidden real zeros; that gap
   was found by the whole-branch review and is now pinned from both sides.
4. **`onError: toastApiError` does not typecheck** against TanStack's `onError` signature. Written as
   `onError: (error) => toastApiError(error)` throughout.

A fifth: the design's verbatim test file for the plan card did not compile under this repo's
`noUncheckedIndexedAccess`, and needed `!` on three `userEvent.click(...)` lines — verified
byte-for-byte as assertion-neutral.

## The requirement no task implemented

**`problems.ts` had none of the `features.*` codes mapped.** §4 of the design requires them, and no
task's file list assigned that file — the plan's own self-review checked that every decision D1–D11
was _referenced_ by a task, which is not the same as checking every requirement has an _implementing_
task. It surfaced only because an implementer flagged the file as outside its stated scope.

All seven are mapped now. Three of them — `features.unknown_key`, `features.duplicate_key`,
`features.key_invalid` — are unreachable from this console (keys come from the catalogue, there is one
control per key, and no endpoint accepts a new key), and are commented as defence rather than flow so
the file does not imply they are handled paths.

## Decisions taken while building

### `PlanFeaturesCard` builds its rows from the catalogue, not from the plan

The plan response carries only the keys the plan already has an opinion about, and no
`defaultEnabled`. Driving the list from it would have hidden every feature the plan is silent on —
the majority of them, and precisely the third state D2 exists to surface.

This is also why the card needs `features.read` (below): the silence, and the "Default today" hint,
both come from `GET /features`.

### Two components split into a presentational list and a query container

`GymFeaturesTab` / `GymFeaturesList` and `PlanFeaturesCard` / `PlanFeaturesList`. The behaviour tests
render the list with plain props instead of mocking a query hook, and `GymFeaturesList` takes `now` as
a prop so an age assertion does not pass today and fail in ninety days.

### The rules most likely to rot silently live outside React

`src/lib/features/plan-state.ts` (the three-state mapping) and `override-age.ts` (the 90-day marker,
with a future timestamp clamped to zero rather than rendering "granted −1 days ago"). Pure functions,
tested without a DOM.

### A raw `<input type="checkbox">`, because that is the convention

No `Checkbox` primitive exists in `components/ui/`; five other call sites use raw checkboxes.

## The whole-branch review, and the bug it found

Run at the end of implementation, over all fifteen commits. It found a **Critical** defect that all
nine per-task reviews had structurally no way to see.

**`PlanFeaturesCard` discarded the operator's draft on every save.** `rows` was rebuilt as a fresh
array literal on each render; `save.mutate()` set `isPending`, which re-rendered the container, which
gave `rows` a new identity, which tripped `PlanFeaturesList`'s render-time draft reset back to
pre-save server state. An operator would set five features, click Save, watch all five snap back — and
lose them permanently if the request then failed. Fixed with `useMemo` over the two query results,
pinned by a test that holds an unresolved promise in flight, so it would have failed against the old
code.

Each per-task review saw a component that was correct on its own. Only the whole-branch view saw the
interaction between the container's render behaviour and the child's reset. That is the argument for
the final gate existing at all.

The same pass also caught that the null-count test verified only one direction, and that two spec-
required unit tests did not exist. Both fixed.

## F4's own review, and what it changed

The independent adversarial gate, run after the increment was pushed. Seven findings; three were
fixed (`2ae0445`), four recorded.

### An override's reason could never be corrected

The save path filtered submissions on the **value** differing, so an operator who found an override
reading "temp", typed a proper justification and clicked Save got nothing at all — no request, no
toast, no error. The backend supports that write directly: it upserts an existing override with a new
reason whenever the value still differs from what the plan gives.

**This was a design omission, not an implementation slip.** D6 says "a reason is required on every
value change" and never considered a reason-only edit. The reason box was seeded blank as well, so the
stored justification appeared in the row above and was absent from the field that edits it.

The draft now seeds from the stored reason, and a row counts as changed when its value moved **or**,
for a row whose source is `Override`, its reason did — restricted to `Override` because a row
resolving through the plan or the default has no override to carry a reason. Blanking an existing
reason is refused client-side, and whitespace-only reformatting is not an edit, so it does not rewrite
the override's author and timestamp for nothing.

On a surface whose entire purpose is recording _why_ an exception exists, an uncorrectable reason was
the wrong thing to be unable to fix, and failing silently was worse than refusing.

### The form stayed live during a save

Only Save was gated on `busy`; the switches and reason boxes were not, so anything toggled or typed
while the PUT was in flight was wiped when the response re-seeded the draft. The same failure class the
whole-branch review had already fixed on the plan card, left standing on the write path itself.

### The plan card's stated permission was wrong

Its comment claimed the split is "`billing.read`/`billing.manage`, deliberately not `features.*`", and
D9's table said the same — but the card issues `GET /features`, which the backend gates on
`features.read`. A principal holding `billing.read` without `features.read` would have taken a 403 and
seen the card collapse into an error.

Latent, because no seeded role is in that position — which is exactly why it went unnoticed. Writing
plan contents is still `billing.manage` alone; **reading the card needs both**, and D9's table has been
corrected rather than the code bent to match a wrong document.

### Recorded, not fixed

- Two silent no-ops: clicking Save with nothing changed returns without a message on both the gym tab
  and the plan card. The plan card's is deliberate (the API refuses an empty list) but unexplained to
  the operator.
- The plan card's three state buttons are not disabled while a save is in flight.
- An empty `category` renders a feature into `<section aria-label="">` under an empty heading;
  `name` has a `.min(1)` and `category` does not.
- `GymFeaturesTab` refetches `GET /gyms/{id}/features` although `GET /gyms/{id}` already returned the
  identical resolved array — a duplicated round trip per tab open.

## Follow-ups, deliberately not done at the end of an increment

**A shared `FeatureRow` shell is the earned extraction.** The row markup — `flex flex-wrap
items-center gap-3 rounded-md border p-3`, the name, the `<code>` key — is copied across all three
surfaces. Worse, `feature-flags-journey.spec.ts` selects rows by those Tailwind classes, so changing
`p-3` to `p-4` for visual reasons would silently break roughly eight E2E tests. Breaking that coupling
is worth its own change; doing it in the last hour of an increment is how you end up debugging
selectors instead.

**Two design choices no designer has seen.** `SourceBadge`'s tones (Override→warning, Plan→info,
Default→neutral), and the four "X unavailable" screens — `gyms/[gymId]`, `plans/[planId]`,
`users/[userId]`, `invoices/invoice-detail` — that moved from `PageHeader`'s muted grey to
`ApiErrorText`'s red with `role="alert"` as a side effect of migrating 41 error call sites. Both
cosmetic, both reversible, neither reviewed by anyone with an eye for it.

## Notes for whoever picks this up

- **The catalogue is seeded insert-only and operator-owned after first insert.** Assertions about a
  feature's copy or default are written relative to whatever state already exists, so repeated E2E
  runs against a long-lived container stay valid. A fresh container gives twelve features with zero
  adoption and zero overrides.
- **`source: Plan` is unreachable without a live subscription.** A gym with none resolves at the
  platform-default layer, by design. The E2E journey provisions a gym, creates and prices a plan, sets
  its feature contents and assigns the subscription for exactly this reason — that setup is not
  incidental.
- **`next dev`'s floating dev-tools indicator overlaps two left-aligned Save buttons at 390px.** The
  journey uses `dispatchEvent('click')` on mobile only for that reason, keeping the real click — and
  Playwright's actionability checks — on desktop, where those two buttons are otherwise exercised by
  no other spec.
- **`toastApiError`'s `title` parameter has no callers.** Specified in the design, kept, untested.
