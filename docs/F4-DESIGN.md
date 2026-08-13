# F4 — Feature-flags console

**Status:** **approved 2026-08-13**, not yet built.
**Predecessors:** [`F1-DESIGN.md`](F1-DESIGN.md) / [`F1-AS-BUILT.md`](F1-AS-BUILT.md) ·
[`F2-DESIGN.md`](F2-DESIGN.md) / [`F2-AS-BUILT.md`](F2-AS-BUILT.md) ·
[`F3-DESIGN.md`](F3-DESIGN.md) (as-built owed, pending its review).
**Backend it consumes:** M4 and M4.1, both merged. Its rules as built are
`GymOS-Backend/docs/BusinessRules/Features.md` — **that document is authoritative over this one's
paraphrase of it**, and every rule below is taken from it rather than invented here.

## 1. What F4 is

F1 was the frontend share of M0–M2, F2 of M3, F3 of M5. **F4 is the frontend share of M4** — the
feature catalogue, what each plan includes, and the per-gym exceptions.

M4 shipped the whole mechanism and no way to see it. Features.md lists "the console UI for all of
this" among M4.1's deliberate deferrals, so nothing today can answer the support question the module
was built to answer — _why is POS off for this gym?_ — without reading the database. F4 answers it.

It was blocked specifically on M4.1 landing: three of M4.1's fixes moved the contract F4 consumes
(`isDeclared`, the override's `overrideSetAtUtc` / `overrideSetByEmail`, and the `gyms.read`-safe
optionality of gym detail's features block). M4.1 is merged (`e72b1f8`), so the contract is stable
whatever its owed review concludes about the implementation.

## 2. Scope

### In

- **`/features`** — the catalogue: twelve keys, grouped by category, with adoption and override
  counts, and editing of copy / default / premium.
- **A `Features` tab on gym detail** — the whole catalogue resolved for that gym, with the layer that
  decided each answer, and override editing.
- **A `Features` card on plan detail** — what this plan includes, in three states.
- **`toastApiError` / `ApiErrorText`** — the extraction F2's review judged earned and F3's plan
  deferred. See D8.

### Out, and why

| Not building                           | Why                                                                                                                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Creating or deleting a feature         | No endpoint exists, deliberately. A key is a compile-time constant code branches on; one invented at runtime would be a flag nothing reads. The catalogue grows in a reviewed commit.                                          |
| Editing a feature's key                | Immutable, and absent from `UpdateFeatureRequest` — the contract's reasoning being that a field the server ignores is worse than no field.                                                                                     |
| Bulk "apply to every gym on this plan" | Explicitly deferred in Features.md: _"no caller has needed it; the plan layer already does it without a write per gym."_ Building it by implication — e.g. as a features × gyms matrix — would be building a deferred feature. |
| An expiry date on an override          | Needs a product decision before a schema one (Features.md). F4 **surfaces** the gap (D5); it does not invent a mechanism.                                                                                                      |
| Anything enforcing a resolved flag     | M4's own deferral: enforcement belongs to the first tenant-facing module with a capability to withhold.                                                                                                                        |
| A "gyms following the default" count   | Not in the contract, and F4 does not fabricate it (D4).                                                                                                                                                                        |

## 3. The prerequisite: the generated types are stale

`src/types/api.d.ts` was generated 2026-08-12 15:56. The backend's `contracts/openapi-v1.json` was
regenerated 2026-08-13 02:36 by the activation-review fixes. M4.1's three additions are already
present, so F4 is not blocked — but **task 1 is `pnpm gen:api`, and its diff carries unrelated
activation changes** (the check endpoint's documented 410-versus-404 among them).

That diff gets **read**, not accepted. The repo's own precedent is M1.3's OpenAPI snapshot gate,
which fails on any change by design because "the review is the gate, not a tool guessing which
changes are breaking." A regeneration that silently absorbs another increment's contract drift is the
same failure with the gate removed.

## 4. The decisions that shape the build

### D1 — Three surfaces, two shared primitives, three separate controls

The catalogue, the gym tab, and the plan card show the same twelve features and answer three
different questions: _what exists_, _what does this gym get and why_, _what does this plan include_.

Shared, because it is genuinely identical: `SourceBadge` (`Override | Plan | Default`) and
`feature-group-list` (grouping by `Category`, which Features.md states is display-only and nothing
branches on).

**Not shared: the three controls.** The catalogue edits copy, default and premium; the gym tab sets a
boolean plus a required reason; the plan card is tri-state. One `FeatureControl` with a `mode` prop
would collapse three different questions into a component whose body is a switch on which screen is
asking — the invented abstraction F2's review was careful to distinguish from the one extraction it
judged earned.

### D2 — The plan's third state is a first-class choice, not a disabled checkbox

A `plan_features` row is an opinion; its absence is silence. `false` and absent look identical to a
gym today and answer differently the moment a platform default moves — which is why resolution has
three layers rather than two.

So each feature is a three-way segmented control: **Included** / **Excluded** / **Default**, sending
`true` / `false` / `null`. `Default` carries a "Default today: on/off" hint read from the catalogue,
so choosing silence shows its consequence rather than requiring the operator to know it.

A checkbox disabled behind a "follow default" switch was rejected: it expresses the third state by
disabling a control, which reads as _unavailable_ rather than as a deliberate choice.

### D3 — The gym tab shows the whole catalogue, not just the exceptions

`GET /gyms/{id}/features` returns every feature resolved, with `source`. A screen listing only
overrides would answer "what did we change?" while the support question is "is POS on, and why?" —
and the second cannot be answered from the first.

### D4 — A default flip is confirmed, and the confirmation invents no number

Flipping `defaultEnabled` has the widest blast radius of any write in the module: it re-answers the
feature for every gym with neither an override nor a plan opinion.

The contract gives `adoptionCount` (gyms resolving the feature **on**, through all three layers) and
`overrideCount` (gyms holding an exception). **Neither is the number of gyms following the default**,
and it cannot be derived from them. So the confirmation states what the flip re-answers, shows the two
counts it genuinely has, and says plainly that the exact figure is not something the API exposes.

Adding `followingDefaultCount` to the backend was considered and rejected for this increment: it would
make F4 a two-repo change with a contract edit and a snapshot regeneration, to improve a dialog. The
honest sentence costs nothing and is available now.

### D5 — The tab states that an override never expires

Features.md is blunt about this, and it is the module's sharpest open risk:

> A goodwill trial granted this way is **permanent until a human remembers it**. […] the day
> enforcement lands, this is revenue quietly leaking through the mechanism built to hand out favours.

F4 is that mechanism's UI. `ResolvedFeatureDetail.OverrideSetAtUtc`'s own documentation says why the
field exists: _"Overrides never expire, so 'how old is this grant' is an operator's only compensating
control short of the audit log."_

So an override row carries its reason, who granted it, its age, and **`Does not expire`** — escalating
to a review marker past **90 days**, matching Features.md's own goodwill-trial example. The threshold
is a **display hint, not a rule**: nothing expires, nothing is withheld, and no request is refused
because of it. This follows F3's D5 precedent of putting a recorded limitation on the screen rather
than in a document nobody opens.

`overrideSetByEmail` is nullable **even when an override decided the answer** — the author's account
was deleted and `SetByUserId` was cleared rather than the override. That renders as `(unknown)`, not
as a missing row: the exception outliving its author is a fact worth showing.

### D6 — There is no "clear override" action, because the API has none

`GymFeatureRequest.IsEnabled` is a non-nullable `bool`. An exception is withdrawn by setting the value
the gym would inherit anyway — Features.md's invariant, enforced by construction.

This has a consequence that is easy to miss. `GET /gyms/{id}/features` returns the **resolved** value
and its source; it does **not** return what the gym would inherit if the override vanished. Computing
that needs the live subscription's plan opinion, and `GET /plans/{id}/features` sits behind
**`billing.read`** — a permission the features vocabulary deliberately excludes, since a SupportAgent
holds `features.read` alone.

**So the console cannot predict, before submitting, whether a change creates an exception or withdraws
one.** F4 does not pretend otherwise:

- **A reason is required on every value change.** The request then never trips
  `features.override_reason_required`, whose required-ness depends on the very comparison the console
  cannot make. When the change turns out to be a withdrawal the reason is simply unused. The cost is
  one sentence when an operator undoes their own mistake, which is the honest price of not guessing.
- **The outcome is reported from the response, never predicted.** `PUT /gyms/{id}/features` returns
  the full resolution, so a change that collapsed into the plan's answer comes back as `source: Plan`
  with no override, and the row says so.

### D7 — An undeclared feature is rendered as undeclared

`isDeclared: false` marks a row whose key no module declares any more — left behind by a rename, and
never deleted because dropping it would cascade into plan contents and gym overrides. Its own
documentation names the failure mode F4 must not reproduce: without the flag the row is
_"indistinguishable from a live feature — editable, counted in adoption, flagged only in a startup log
nobody reads at 2am."_

So it renders visually distinct, labelled as declared by nothing, **with editing disabled**. Rendering
it identically to a live feature would reproduce exactly the bug M4.1 added the flag to fix.

### D8 — `toastApiError` lands here, and the count is why

F2's whole-branch review judged one extraction clearly earned, counting the
`error instanceof ApiError ? error.message : 'Something went wrong.'` ternary **26 times across 17
files**. F3's plan made it Task 2 and warned that otherwise F3's error paths "become copy 27."

It did not land. The ternary is now **41 occurrences across 22 files**, with the literal
`'Something went wrong.'` written 31 times. F3 became copies 27–41.

F4 adds three surfaces with error paths. It builds the helper first — `apiErrorMessage(error): string`
and `toastApiError(error, title?)` in `src/lib/feedback/`, `ApiErrorText` in
`src/components/feedback/` — migrates all 41 call sites, then uses it. This is deferred scope coming
due, not new scope: it was sanctioned by a review two increments ago.

Creating the helper and using it only in new code was rejected: it leaves two idioms for one job,
which is worse than one idiom used consistently.

### D9 — Permissions hide panels; the request authorises

F1's standing rule: `usePermission` hides UI and never authorises. Every request is authorised by the
API regardless of what the console rendered.

The two vocabularies are deliberately split — _granting one gym an exception is day-to-day
administration; deciding what a plan includes is pricing the product_ — so F4 degrades per surface,
following F3's D6:

| Surface               | Read            | Write             |
| --------------------- | --------------- | ----------------- |
| `/features` catalogue | `features.read` | `features.manage` |
| Gym `Features` tab    | `features.read` | `features.manage` |
| Plan `Features` card  | `billing.read`  | `billing.manage`  |

Consequences worth stating, because they are the point of the split: a **SupportAgent**
(`features.read` only) gets both features surfaces read-only and no plan card — enough to answer "why
is POS off?" without authority to reprice. A **BillingAdmin** (`features.read` + `billing.*`) can set
plan contents but cannot edit the catalogue or grant an exception.

Gym detail's `features` block is **absent, not gated**, for a caller without `features.read` (M4.1
task 4) — the route needs only `gyms.read`. The tab is therefore rendered from the block's presence,
never from a permission check alone, or a `gyms.read`-only role sees an empty tab where the answer is
"you cannot read features."

### D10 — `If-Match` where the API requires it, and nowhere else

| Write                      | `If-Match`   | Why                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /features/{id}`       | **required** | Overwrites what the caller read, no state machine to refuse a stale interleaving.                                                                                                                                                                                                                                             |
| `PUT /plans/{id}/features` | **required** | Same, and it re-answers the feature for every gym on the plan.                                                                                                                                                                                                                                                                |
| `PUT /gyms/{id}/features`  | **none**     | Each override is its own aggregate keyed on (gym, feature) and the request merges per key, so two operators editing _different_ features do not conflict. Two editing the _same_ one is a disagreement about policy, not a lost update: the later decision wins, carries its own reason, and the trail keeps the earlier one. |

The two guarded forms follow F2's pattern exactly — `rowVersion` from the response becomes the
`If-Match`, and the form is **keyed by `rowVersion`** so a successful save, or a reload after a 409,
resets it. F4 adds no new concurrency machinery.

### D11 — A null count is absent, never zero

`AdoptionCount` and `OverrideCount` are `int?`, and a **write response returns them null**. Rendering
null as `0` would tell an operator "no gyms use this" in the moment right after they edited it. The
cell shows nothing instead.

## 5. Layout

```
/features                       Catalogue
  ├─ Operations   pos ● on  ·  inventory ● on
  ├─ Members      crm ○ off [premium]  ·  member_app ○ off [premium]
  ├─ Insights     reports ● on  ·  analytics ○ off [premium]
  ├─ Training     nutrition ○ off [premium]  ·  workout_builder ○ off [premium]
  ├─ Growth       marketing ○ off [premium]  ·  ai_assistant ○ off [premium]
  └─ Integrations gateway ○ off  ·  access_control ○ off
       gateway and access_control are the only two off-by-default keys that are
       NOT premium — they are prerequisites (hardware on site), not upsells.
       each row: default state · premium badge · adoption · overrides · [Edit]

/gyms/[id]  ▸ Features tab
  crm        ● on    [Override]   "90-day goodwill trial"
                                  granted by ops@… · 94 days ago
                                  ⚠ Does not expire — review
  pos        ● on    [Plan]
  gateway    ○ off   [Default]

/plans/[id] ▸ Features card
  crm        [ Included | Excluded | Default ]      Default today: off
  pos        [ Included | Excluded | Default ]
```

Mobile is the responsiveness gate, as in F1–F3: the catalogue and the gym tab become card lists, the
segmented control stays a segmented control (three short labels fit 390px), and every nav hop goes
through the drawer.

## 6. Testing

**Unit** (vitest + RTL) — one per rule that could rot silently:

| Rule | Test                                                                     |
| ---- | ------------------------------------------------------------------------ |
| D2   | the three-way control maps to `true` / `false` / `null`                  |
| D2   | `Default` shows the catalogue's current default                          |
| D4   | the flip dialog states no exact affected-gym count is available          |
| D5   | age, `Does not expire`, and the review marker past 90 days               |
| D5   | null `overrideSetByEmail` renders `(unknown)`                            |
| D6   | a reason is required on every value change                               |
| D6   | the row reports the source returned by the response, not a predicted one |
| D7   | `isDeclared: false` renders as undeclared with editing disabled          |
| D9   | each surface hides its write affordances without the matching permission |
| D9   | gym detail with the `features` block absent renders no tab               |
| D11  | a null count renders as absent, never `0`                                |
| D8   | `apiErrorMessage` maps known codes and falls back                        |

**E2E** — a new `feature-flags-journey.spec.ts`, both viewports. **No SQL seed is needed**, unlike
the analytics journey: the catalogue self-seeds at host startup.

It does need state that only the UI can build, and this is the part to plan for rather than discover:
`source: Plan` is unreachable for a gym with no **live** subscription — a gym without one resolves at
layer 3, by design, so a journey that only provisions a gym can never observe layer 2. The spec
therefore provisions its own gym, creates a plan, sets that plan's feature contents, and assigns the
subscription, exactly as `billing-journey` builds its own fixtures. That is the journey's setup cost
and it is unavoidable without a SQL seed.

The journey proper:

catalogue → edit copy → flip a default through the confirmation → gym `Features` tab → grant an
override with a reason → assert `source: Override`, its age, `Does not expire` → **set it back to the
inherited value** → assert the exception was withdrawn and the source is now `Plan` or `Default` →
plan card → set one feature `Excluded`, another `Default`.

That grant-then-withdraw pair is the assertion that matters: it proves M4's headline invariant end to
end, and it is only assertable because the PUT returns the full resolution (D6). Every nav click
carries the `isMobile` drawer branch — the omission of which cost the mobile operator journey nine
silently skipped tests (`ce4fa4b`).

## 7. Definition of done

- All three surfaces built, `pnpm gen:api` diff read and explained in the as-built.
- `toastApiError` extracted and all 41 prior call sites migrated.
- Unit tests above green; `feature-flags-journey` green on **both** viewports with zero skips.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean.
- `F4-AS-BUILT.md` **left unwritten until after F4's review**, per the convention F3 set.

## 8. Deferred, with the dependency each waits on

| Deferred                                   | Waits on                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| An expiry date on an override              | The product decision Features.md names: does an exception lapse silently, or does someone get told first? |
| `followingDefaultCount` in the flip dialog | A backend contract addition (D4)                                                                          |
| Bulk apply across a plan's gyms            | A caller that needs it                                                                                    |
| Per-feature usage analytics                | M5 stats                                                                                                  |
| Anything enforcing a flag                  | The first module with a capability to withhold                                                            |

## 9. Risks

- **The regenerated contract carries another increment's changes** (§3). Mitigated by reading the
  diff; the risk is a reviewer accepting it wholesale.
- **The reason-on-every-change rule is friction** on an undo. Accepted deliberately (D6) because the
  alternative makes a validation error part of the normal flow. If operators complain, the fix is a
  backend field exposing the inherited value — not a client-side guess.
- **The 90-day marker is a guess at a threshold**, not a policy. It is presentational and reversible,
  and stated as such on the screen.
- **F3's review is still owed**, and this increment builds on F3's shell. If that review changes the
  nav or the tab pattern, F4 inherits the change. Sequencing F4 after F3's review was considered;
  Features.md's own priority order puts F4 first, and none of the four owed reviews blocks another.
