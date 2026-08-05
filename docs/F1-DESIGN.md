# F1 — Super Admin console, catch-up increment

**Status:** design, awaiting review. No code written.
**Repo:** GymOS-Platform (ADR-52). **Consumes:** GymOS-Backend `v0.5.1`, contract `contracts/openapi-v1.json`.

---

## 1. What F1 is

The frontend share of **M0, M1, and M2** — the work the frozen roadmap (ARCHITECTURE.md §7) attached to
those milestones and that was never built while the backend ran ahead:

| Roadmap milestone | Frontend it called for                   | State     |
| ----------------- | ---------------------------------------- | --------- |
| M0                | "Next.js shell with auth-less layout"    | not built |
| M1                | login/refresh/logout, users CRUD screens | not built |
| M2                | "gym detail UI"                          | not built |

F1 closes exactly that gap and nothing beyond it. From M3 onward, frontend and backend land in the same
milestone, as the roadmap always intended, so the debt cannot rebuild.

**F1 is not a redesign.** No ADR is superseded. Three items are _deferred_ rather than changed, each
recorded in §9 with the dependency it waits on.

## 2. Scope

### In

| Screen                                                                              | API it consumes                                                   | Why it earns its place                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| **Login**                                                                           | `POST /auth/login`                                                | Nothing else is reachable without it.                 |
| **Authenticated shell** — sidebar, topbar, user menu, theme                         | `GET /auth/me`                                                    | The frame every later milestone hangs screens on.     |
| **Gyms list** — server-side paging/sort/search, status filter, country filter       | `GET /gyms`                                                       | The operator's actual home screen.                    |
| **Gym provision form**                                                              | `POST /gyms`                                                      | The one workflow that creates revenue.                |
| **Gym detail** — Overview + Branding tabs, Suspend / Reactivate / Activate / Delete | `GET/PUT /gyms/{id}`, the four actions, `PUT /gyms/{id}/branding` | M2's named deliverable.                               |
| **Users list + detail** — invite, edit, suspend/reactivate, role assignment         | `/users`, `/roles`                                                | M1's named deliverable.                               |
| **Audit log** — filterable table, row opens a before/after diff                     | `/audit-logs`                                                     | The screen that makes every other action accountable. |
| **Change own password**                                                             | `POST /auth/change-password`                                      | The only way an invited administrator becomes usable. |

Twenty operations, all of them already shipped and contract-frozen.

### Out, and why

- **Dashboard.** Its StatCards read gym/member/staff/MRR/device counts that arrive with M5's stats jobs.
  A grid of zeroes teaches operators to distrust the screen — the same argument that kept `gym_stats` off
  the gym detail response in M2. **Post-login landing is the Gyms list** until M5 gives the dashboard
  something true to say.
- **Subscription / Features / Devices / Invoices tabs** on gym detail — M3, M4, M6, M3 respectively. The
  tab strip is built to take them; the tabs are absent, not stubbed.
- **Monitoring, Analytics, Settings pages** — M5, M5, M7.
- **Command palette** (Ctrl+K) — needs the module manifest's command declarations.

## 3. The decisions that shape the build

### D1 — The console and the API share one origin. This is not negotiable, and it is why no backend change is needed.

The refresh cookie is `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`, and the backend configures
**no CORS at all**. A console served from a different origin therefore fails twice: the browser blocks
the call, and the cookie would not be attached even if it didn't.

**Next.js proxies the API under its own origin** (`next.config.ts` rewrites `/api/v1/*` → backend). The
browser only ever talks to the console's origin, so the cookie is same-site by construction.

Two details that are easy to get wrong:

- **The proxy must preserve the exact path.** The cookie's `Path=/api/v1/auth` is matched against the
  _browser-visible_ URL, so the console must call `/api/v1/auth/refresh`, not `/api/auth/refresh`.
- **`Secure` over `http://localhost` is fine** — browsers make an exception for localhost, which the
  backend's `RefreshTokenCookie` already relies on. Dev needs no TLS and no weakened attribute.

The rejected alternative — CORS with credentials plus `SameSite=Lax` — trades a real security property
for a dev convenience, and would need a backend change and an ADR. **Production must keep this shape:**
one public origin with `/api/*` routed to the API (Azure Front Door or App Service routing, AD-11). A
deployment that splits the origins breaks refresh, and it breaks it _after_ login appears to work.

### D2 — Types are generated; the client is written by hand

AD-12 requires DTO types generated from the OpenAPI document. It does not require a generated _client_,
and §4.2 explicitly describes a hand-written `lib/api/client.ts` ("fetch + auth + refresh") with
per-module files.

**`openapi-typescript`** generates `src/types/api.d.ts` from `contracts/openapi-v1.json`; a thin
hand-written client wraps `fetch`. Rationale: the subtle parts of this client — single-flight refresh,
`If-Match` round-tripping, problem-code mapping — are specific to this backend and belong in code we own
and test, not in a generator's template. Drift is caught by `tsc` at build time, which is what AD-12 asks
for. A `pnpm gen:api` script regenerates; **CI fails if the checked-in types differ from the contract**,
mirroring the backend's own snapshot gate (R13).

### D3 — The access token lives in memory only

15-minute JWT, held in a module-scoped variable reachable by the client, never in `localStorage` or a
readable cookie — anything an XSS payload can read is not a place for a bearer token. A page reload
therefore starts with no token, which is precisely what the refresh cookie is for: **the app boots by
calling `POST /auth/refresh`**, and only redirects to login if that fails.

### D4 — Refresh must be single-flight, or the console will log people out

The backend rotates refresh tokens and **treats a replayed token as an attack**, revoking its
descendants. So the naive interceptor — every 401 triggers a refresh — is actively harmful here: three
requests failing together fire three refreshes, two of them presenting a token the first has already
rotated away, and reuse detection kills the chain. The user is signed out by the recovery logic.

One in-flight refresh promise, shared by every waiting request; on success they retry once, on failure
they all fail and the app redirects to login. This is the single riskiest piece of logic in F1 and gets
tests of its own, including the concurrent-401 case.

### D5 — `perm_hash` mismatch refetches `/auth/me`

The JWT carries a hash of the caller's permission set. When a response indicates it no longer matches,
the client refetches `/auth/me` and re-renders the nav and gates, rather than waiting up to 15 minutes
for the token to expire. Permission _enforcement_ remains the API's (AD-5).

### D6 — Optimistic concurrency is the client's job, once

The client stores the `ETag` from every read and sends it as `If-Match` on the matching write, so no
screen has to remember. The three failure codes get distinct, honest handling:

| Response                                          | What the user sees                                                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `428` `concurrency.version_required`              | A bug in the console, not the user's problem — logged loudly, generic error shown. It means a write skipped the read.                                            |
| `409` `concurrency.conflict` (`retryable: false`) | "Someone else changed this while you were editing." Offer **Reload and reapply** — never a silent retry, which would be last-write-wins wearing a different hat. |
| `400` `concurrency.malformed_version`             | Same as 428: ours to fix.                                                                                                                                        |

### D7 — Destructive actions mirror the backend's own step-up

`DELETE /gyms/{id}` requires `X-Confirm-Action` carrying the slug. The dialog therefore asks the operator
to **type the slug**, and sends what they typed. It does not helpfully prefill it: a prefilled
confirmation confirms nothing, and the header exists precisely so a mis-clicked row cannot delete a
business.

### D8 — Errors are read from `code`, not from prose

Every failure is RFC 7807 with a stable `code`. One mapping table turns codes into human sentences
(`gyms.slug_taken` → "That address is already in use…"), falling back to the response's `detail`. Field
codes (`gyms.slug_invalid`, `gyms.currency_invalid`) attach to the form field they name, so validation
lands where the operator is looking. **Never branch on `title` or on the status code alone.**

### D9 — The sidebar is permission-filtered client-side, for now

ARCHITECTURE-EXTENSIONS §2.6 puts the nav tree behind `GET /api/v1/navigation`, merged from module
manifests. **That endpoint does not exist**, and cannot until the `IModule` loader does — a substantial
piece of architecture that is not F1's business.

F1 renders four nav items, filtered against the permissions in `/auth/me`. This is a **deferral, not a
substitute**: the nav lives in one module (`lib/nav`) with the shape `/navigation` will return, so
switching is replacing the data source. Recorded in §9 so it cannot quietly become permanent.

### D10 — Client rendering inside the App Router, and no BFF

The access token is in browser memory (D3), so pages that call the API are client components; the App
Router supplies routing, layout, theming, and the query provider. A BFF holding the session server-side
would be more secure and is a _different architecture_ than AD-4 describes — it would need an ADR, so it
is out of scope here rather than smuggled in.

## 4. Layout

`src/frontend/` in §4.2 predates the repo split; ADR-52 makes this repo the console, so the tree hangs
from the root. Structure otherwise follows §4.2 exactly, minus the folders for out-of-scope features.

```
src/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (admin)/layout.tsx              # sidebar + topbar, auth guard
│   │   ├── gyms/{page,new/page}.tsx
│   │   │   └── [gymId]/{page,branding/page}.tsx
│   │   ├── users/{page,[userId]/page}.tsx
│   │   ├── audit-logs/page.tsx
│   │   └── account/password/page.tsx
│   └── layout.tsx                      # theme + query providers
├── components/{ui,layout,data,forms,feedback}/
├── features/{gyms,users,audit}/
├── lib/{api,auth,nav,validation,utils}/
├── hooks/
└── types/api.d.ts                      # generated — never edited
```

## 5. Dependencies

All from the spec's approved list, all permissive: **Next.js**, **React**, **TypeScript**, **Tailwind**,
**shadcn/ui** (MIT), **TanStack Query** (MIT), **react-hook-form + zod** (MIT), **next-themes** (MIT).
Tooling: **openapi-typescript** (MIT), **Vitest** + **React Testing Library** (MIT), **Playwright**
(Apache-2.0), **ESLint**, **Prettier**.

Recharts is on the approved list but not installed in F1 — no chart is in scope.

**No GPL/AGPL, and nothing outside this list without a policy update.** F1 creates
`docs/DEPENDENCY_POLICY.md` and a CI check that fails on a package absent from the allowlist — the
analogue of the backend's `ForbiddenPackagesTests`, and it lands in the same commit as the policy, per
the standing rule.

Next.js is the frozen architecture's choice (§4.2, approved) rather than the house Angular default; the
hosting target stays Azure per AD-11.

## 6. Testing

Proportionate to the backend's discipline, without ceremony for its own sake:

| Level                     | Covers                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Vitest**                | The API client: single-flight refresh incl. concurrent 401s (D4), `If-Match` round-trip, problem-code mapping, permission gating helpers. This is where the real logic is.                                         |
| **React Testing Library** | The confirm dialog refusing a wrong slug; the 409 conflict path offering reload; a form mapping a field code to its field.                                                                                         |
| **Playwright**            | One end-to-end pass against a **real backend + real PostgreSQL**: log in → provision a gym → activate → suspend with reason → edit branding → delete with typed confirmation → verify it appears in the audit log. |
| **CI**                    | `tsc --noEmit`, ESLint, Prettier check, Vitest, generated-types-match-contract gate, Playwright against the backend container, `next build`.                                                                       |

## 7. Definition of done

- Every screen in §2 works against a live backend, verified by hand as well as by Playwright.
- A page reload keeps the operator signed in (D3 bootstrap works).
- Concurrent 401s produce **one** refresh and no sign-out (D4), proven by test.
- A stale edit yields the 409 reload path, not a silent overwrite.
- Deleting a gym is impossible without typing its slug.
- The nav hides what the caller's permissions do not include — and the API still refuses it if forced.
- `tsc`, lint, format, unit, and E2E all green; generated types match the committed contract.
- `README.md` status updated; `docs/F1-AS-BUILT.md` records what was decided while building.

## 8. Verification against a running system

Backend from `GymOS-Backend` at `v0.5.1` on `http://localhost:5080`, PostgreSQL in Docker. Note the
port-5432 collision documented in the backend's `STATUS.md`, and its test-host warning if you run its
suite.

## 9. Deferred, with the dependency each waits on

| Deferred                                          | Waits on                  | Note                                                    |
| ------------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| `GET /api/v1/navigation`-driven sidebar           | `IModule` manifest loader | D9. Client-side filtering is temporary by construction. |
| Dashboard                                         | M5 stats jobs             | Landing is the Gyms list until then.                    |
| Subscription / Features / Devices / Invoices tabs | M3 / M4 / M6 / M3         | Tab strip designed to receive them.                     |
| Feature-flag filtering of nav and routes          | M4                        | `/auth/me` returns permissions today, not feature keys. |
| Monitoring / Analytics / Settings                 | M5–M7                     |                                                         |
| BFF session model                                 | an ADR, if ever wanted    | D10.                                                    |

## 10. The one decision I need from you

**The API client generator.** I recommend `openapi-typescript` (types only) plus a hand-written client,
for the reasons in D2. The alternative — a full-client generator such as Orval or Hey API — would produce
hooks and calls for free but would own the auth/refresh logic that D4 shows is subtle and
backend-specific. Say if you'd rather have the heavier generator and I will design the auth layer around
it instead.

Everything else above is a judgement I am prepared to defend; tell me where you disagree and I will
change it before writing code.

## 11. Risks

| Risk                                                                               | Mitigation                                                                                                                              |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Split origins in production silently break refresh **after** login appears to work | D1 is written into the deployment notes; the Playwright pass runs through the proxy, so a split origin fails CI rather than production. |
| Refresh rotation + reuse detection turns a retry storm into a sign-out             | D4 single-flight, with the concurrent case tested explicitly.                                                                           |
| The console becomes the de-facto contract and freezes backend mistakes             | F1 is deliberately early, while v1 has no external consumers; contract problems found now cost an edit.                                 |
| Scope creep into M3–M7 screens                                                     | §2's "out" list is the gate; a screen with no true data does not ship.                                                                  |
