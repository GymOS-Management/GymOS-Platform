# F2 — Billing: plans, subscriptions, invoices

**Status:** approved 2026-08-11, not yet built.
**Predecessor:** [`F1-DESIGN.md`](F1-DESIGN.md) / [`F1-AS-BUILT.md`](F1-AS-BUILT.md).

## 1. What F2 is

F1 was the frontend share of M0–M2. **F2 is the frontend share of M3** — the billing milestone the
backend completed in M3.1–M3.4: the plan catalogue, subscription assignment and lifecycle, invoices,
and the renewal/overdue sweeps that move state without anyone clicking anything.

F1 anticipated this. Its gym-detail tab strip was built to receive Subscription and Invoices tabs, and
its deferral table names M3 as the dependency for both. F2 fills those two tabs and adds the two
platform-level screens the catalogue needs.

Twenty operations, all shipped and contract-frozen — the same count F1 consumed.

## 2. Scope

### In

| Screen                                     | Route                       | API it consumes                                                                              | Why it earns its place                                                     |
| ------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Plans list**                             | `/plans`                    | `GET /plans` (page, search, `includeInactive`, `isPublic`)                                    | Nothing can be sold until something is priced.                             |
| **Plan create**                            | `/plans/new`                | `POST /plans`                                                                                | Today a new plan needs a developer.                                        |
| **Plan detail** — Overview + Prices tabs   | `/plans/{planId}`           | `GET/PUT /plans/{id}`, `activate`, `deactivate`, `PUT/DELETE .../prices`                     | Repricing is the routine commercial act.                                   |
| **Gym detail → Subscription tab**          | `/gyms/{gymId}`             | `GET/PUT .../subscription`, `cancel`, `resume`, `convert-trial`, `payment-state`, `history`  | M3.2's named deliverable, on the screen the operator already has open.     |
| **Gym detail → Invoices tab**              | `/gyms/{gymId}`             | `GET /gyms/{id}/invoices`                                                                    | "What does this gym owe?" asked where the gym is.                          |
| **Invoices list + detail**                 | `/invoices`, `/invoices/{id}` | `GET /invoices` (status, `gymId`, `overdue`), `GET /invoices/{id}`, `mark-paid`, `void`     | The cross-gym collections view; per-gym alone cannot answer "who is late?" |

### Out, and why

- **Dashboard / MRR.** M5's stats jobs. Unchanged from F1: a grid of zeroes teaches operators to
  distrust the screen.
- **Dunning UI.** M3.4 raises `invoice.became_overdue` but nothing consumes it yet. A reminder button
  that sends nothing is worse than no button.
- **Manual invoice creation.** `Draft` is declared but has no producer — by deliberate backend design.
  Whoever gives it one adds its transitions first.
- **Feature-flag filtering** (M4) and the **`/navigation`-driven sidebar** (needs the `IModule` loader).
  Both remain F1's deferrals, unchanged.
- **Plan deletion.** Does not exist and should not: see D6.

## 3. Prerequisite — the contract does not declare the headers it enforces

**This is backend work, and it belongs in F2 because F2 is the first thing to consume the contract as a
generated client would.**

Three headers are enforced by the pipeline and documented only in prose:

| Header             | Enforced by                              | Failure without it                       | Declared? |
| ------------------ | ---------------------------------------- | ---------------------------------------- | --------- |
| `Idempotency-Key`  | `IdempotencyHeaderMiddleware` (AD-39)    | `400 idempotency.key_required`           | No        |
| `If-Match`         | `versionRequired: true` in the command    | `428` on the five PUTs; optional elsewhere (D5) | No        |
| `X-Confirm-Action` | `ConfirmationHeaders` (AD-6)             | `invoices.confirmation_mismatch` on void | No        |

All three are in F2's own surface, not borrowed from elsewhere: `POST /invoices/{id}/mark-paid` alone
requires the first two, and `POST /invoices/{id}/void` requires the second and third.

`openapi-typescript` generates types from parameters, so none of this reaches the generated types. F1
survived it because D2 chose a hand-written client and the author read the prose. That is precisely the
fragility: every new client rediscovers the requirement by getting a 400.

**Fix:** declare each as a real parameter through an operation transformer keyed on the mechanism that
already enforces it — `IIdempotentCommand` for the first, the `If-Match`-reading endpoints for the
second, `ConfirmationHeaders` for the third — so the declaration cannot drift from the enforcement. The
regenerated snapshot diff should contain parameters and nothing else.

This is the third instance of one defect: the document not describing what the pipeline requires. The
first two were the missing bearer scheme and the empty `security: [{}]` requirement.

## 4. The decisions that shape the build

### D1 — The idempotency key is minted at intent, not per request

`POST /invoices/{id}/mark-paid` is the platform's first production `IIdempotentCommand`. Its whole
purpose is that a retried request replays the stored outcome instead of paying twice.

The client already retries once after a token refresh (F1 D4), and React Query retries network
failures. **If the key were generated inside the request function, every retry would carry a fresh key
and the backend would treat it as a new payment** — the mechanism defeated by the code meant to use it.

So the key is created when the operator confirms the action, and held for that intent's lifetime across
every retry. One `Idempotency-Key` per decision-to-pay, not per HTTP attempt. A UUID, per the backend's
own API_STANDARDS §10 guidance.

### D2 — Money is formatted from amount + currency, never fixed at two decimals

`Money` carries minor units per currency, and the backend rounds to them: JPY has 0, KWD has 3. A
`toFixed(2)` misprints both. `Intl.NumberFormat(locale, { style: 'currency', currency })` derives the
right precision from the code. One `formatMoney` in `src/lib/utils/format.ts`; no component formats
money itself.

### D3 — "Overdue" is never recomputed on the client

The backend defines overdue in exactly one place as `Overdue ∨ (Issued ∧ past due)`, so an invoice
reads as overdue in the window between falling due and the hourly sweep relabelling it. A client that
compares `dueDate` against the browser clock will disagree with the server — around the sweep, around
midnight, and on any machine with a skewed clock. **The UI renders the server's answer.** M3.4 moved
the sweeps onto the database clock for the same reason; the client has even less claim to an opinion.

### D4 — Most operators see billing read-only, and that is the design

`PlatformAdmin` holds `billing.read` but **not** `billing.manage`: deciding what the platform charges is
a commercial authority, not day-to-day administration. `subscriptions.manage` is separate again —
deciding what to sell and deciding what one customer pays are different powers.

| Capability                                            | Permission             |
| ----------------------------------------------------- | ---------------------- |
| See plans and invoices                                | `billing.read`         |
| Create/edit/price/activate plans; mark-paid; void     | `billing.manage`       |
| Assign, cancel, resume, convert trial, payment state  | `subscriptions.manage` |

Per F1's standing rule, `usePermission()` hides UI and never authorizes — the API re-checks every call.

### D5 — `If-Match` is required on PUTs and optional on action endpoints

**Corrected 2026-08-11 during implementation.** An earlier draft of this decision said every write that
reads `If-Match` requires it. It does not, and the distinction is deliberate: `versionRequired` is the
source of truth, and only five commands pass `true` — `UpdatePlan`, `UpdateGym`, `UpdateGymBranding`,
`UpdateUser`, `SetUserRoles`. Every one is a **PUT that overwrites fields the caller did not send**,
where a missing precondition is last-write-wins over data you never saw.

Action endpoints — plan activate/deactivate and price writes, gym lifecycle, invoice `mark-paid` and
`void`, the subscription writes — pass `versionRequired: false`. They **honour** `If-Match` when it is
supplied (a stale value is still refused with 409) but do not demand it, because each changes one
explicit thing rather than overwriting a whole resource.

So the client:

- sends `precondition: true` on the five PUTs, where omitting it is `428`;
- sends the read `rowVersion` on invoice `mark-paid` and `void` **by choice**, not by obligation — an
  operator marking an invoice paid from a stale screen should be refused, and supplying the version is
  what buys that;
- sends nothing on `PUT /gyms/{gymId}/subscription`, which neither takes nor needs one.

What this means for `mark-paid`: it carries **three** headers — `Idempotency-Key` (required),
`If-Match` (optional but sent), and the bearer token — and the contract declares none of them today
(§3). The fix in §3 must declare each with the requiredness the pipeline actually applies; a contract
that overstates enforcement is the same defect as one that hides it.

### D5a — Voiding an invoice is a step-up action, confirmed by its number

`POST /invoices/{id}/void` requires `X-Confirm-Action` carrying the **invoice number**; a mismatch is
`invoices.confirmation_mismatch`. This is AD-6's second use after gym deletion, and F1's D7 already
established the pattern: the confirmation travels as a header, so a replayed script that never read the
resource cannot satisfy it. The void dialog asks the operator to type the invoice number, exactly as the
gym delete dialog asks for the slug.

### D5b — Marking paid records an optional payment reference

`MarkInvoicePaidRequest` is a nullable body with an optional `paymentReference` — the bank reference or
receipt number that makes a payment traceable later. The dialog offers it as an optional field rather
than omitting the body, because "which payment settled this invoice?" is the first question a billing
dispute asks.

### D6 — Nothing offers deletion

`DELETE /plans/{id}` returns `405` by design — §3.4's "delete = deactivate only", because a deleted plan
would orphan the subscriptions that copied its price. The UI offers **Deactivate** (a plan that cannot
be newly assigned) and never renders a delete affordance. `IsActive` and `IsPublic` are separate
questions and get separate controls: inactive means "cannot be newly assigned", unlisted means
"assignable but not advertised" — a negotiated plan.

### D7 — Cancellation distinguishes "now" from "at period end", and requires a reason

`CancelSubscriptionRequest` takes `reason` (required) and `immediately`. Scheduled cancellation leaves
the subscription **Active** and live, because the gym paid through the period. A UI that collapsed the
two would cut off a paying customer. The dialog asks which, and says plainly what each does.

Related, and shown rather than hidden: a subscription can carry a **pending plan change** applied at the
next renewal, and `PastDue` **does not withhold service** — that is a gym suspension, a different act.

### D8 — Billing queries refetch on focus; nothing polls

M3.4's sweeps change state with no user action: invoices become `Overdue` hourly, subscriptions become
`PastDue` alongside. F1 set `refetchOnWindowFocus: false` globally, which would leave an operator
reading a stale status indefinitely.

Billing queries override it to `true`. No `refetchInterval`: the state changes hourly at most, and a
heartbeat in every open tab is a poor trade for that. `staleTime` stays at F1's 15s.

## 5. Layout

```
src/app/(admin)/plans/page.tsx                     list
src/app/(admin)/plans/new/page.tsx                 create
src/app/(admin)/plans/[planId]/page.tsx            detail: Overview + Prices tabs
src/app/(admin)/invoices/page.tsx                  cross-gym list
src/app/(admin)/invoices/[invoiceId]/page.tsx      detail: lines, totals, actions
src/app/(admin)/gyms/[gymId]/page.tsx              + Subscription and Invoices tabs

src/features/plans/{plan-form,price-editor,plan-status-actions}.tsx
src/features/subscriptions/{subscription-card,assign-dialog,cancel-dialog,history-list}.tsx
src/features/invoices/{invoice-table,invoice-detail,mark-paid-dialog,void-dialog}.tsx

src/lib/api/endpoints.ts    + 20 operations
src/lib/api/client.ts       + idempotency-key option (D1)
src/lib/utils/format.ts     + formatMoney (D2)
src/lib/nav/items.ts        + Plans, Invoices (flat, per D9's tree being temporary)
src/types/api.d.ts          regenerated by `pnpm gen:api`
```

Reused from F1 unchanged: `DataTable` (two-rendering responsive table), `StatusBadge`, `EmptyState`,
`PageHeader`, `FormField`, the confirm dialogs, `useDebounced`.

## 6. Testing

**Unit (vitest)**

- `formatMoney` across 0-, 2- and 3-minor-unit currencies (JPY, EUR, KWD) — D2's whole point.
- The idempotency key survives a retry of the same intent and differs between two intents — D1.
- `mark-paid` sends `Idempotency-Key` **and** `If-Match` together, and `void` sends `X-Confirm-Action`
  carrying the invoice number — D5/D5a. Three headers on one call is exactly where a client silently
  drops one.
- Subscription and invoice status → badge mapping, including that `Issued`-and-past-due renders as
  overdue **from the server's flag**, not from a client date comparison — D3.
- Permission gating: `billing.read` without `billing.manage` renders no manage controls — D4.

**E2E (Playwright, both viewports)**

Extends the operator journey: create a plan → price it → assign it to a gym → see the issued invoice on
both the gym tab and the cross-gym list → mark it paid → see the subscription settle. Run at desktop
and mobile per F1's responsive rule.

**Contract drift**: the existing CI step regenerates types from the backend snapshot and fails on a
diff. It will fail on the prerequisite's parameter additions until the types are regenerated — which is
the gate working.

## 7. Definition of done

- `pnpm typecheck && pnpm lint && pnpm format:check` clean.
- `pnpm test` and `pnpm test:e2e` green at both viewports.
- `node scripts/check-dependencies.mjs` clean — **no new runtime dependency is expected**; if one
  becomes necessary it changes `docs/DEPENDENCY_POLICY.md` in the same commit.
- Verified against a running backend: a plan created in the UI is assignable, its invoice appears, and
  marking it paid settles the subscription.
- The backend prerequisite is merged with its snapshot regenerated and reviewed on its own terms.

## 8. Deferred, with the dependency each waits on

| Deferred                        | Waits on                                     |
| ------------------------------- | -------------------------------------------- |
| Dashboard / MRR                 | M5 stats jobs                                |
| Dunning / reminder actions      | a consumer for `invoice.became_overdue`      |
| Manual invoice creation         | a producer for `Draft`                       |
| Feature-flag filtering          | M4                                           |
| `/navigation`-driven sidebar    | `IModule` manifest loader (F1 D9)            |
| Devices tab                     | M6                                           |

## 9. Risks

- **The prerequisite spans two repositories.** F2 cannot be honestly finished until the backend
  declares its headers, and that half needs its own review. If it is deferred, the frontend hard-codes
  three undocumented headers and the contract keeps lying.
- **Twenty operations is F1's size**, and F1 was a whole milestone. If it runs long the natural split
  is the plans catalogue (8 operations, self-contained, no gym-detail changes) shipping first.
- **The E2E journey now depends on background jobs not firing mid-test.** The renewal sweep runs every
  15 minutes; a long E2E run could see a subscription renew underneath it. `Jobs:Enabled=false` on the
  test backend is the lever, and the suite should set it deliberately rather than hope.
