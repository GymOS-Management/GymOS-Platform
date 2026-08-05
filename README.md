# GymOS-Platform

The GymOS **Super Admin web application** — the platform operator console. Next.js / TypeScript /
Tailwind / shadcn-style components, per the frozen architecture in
[GymOS-Specification](../GymOS-Specification) (frontend layout: ARCHITECTURE.md §4.2; repository map:
**ADR-52**).

**Status: F1 complete, awaiting review.** F1 is the frontend share of milestones M0–M2, which the
backend had run ahead of: sign-in, the authenticated shell, gyms (list, provision, detail, lifecycle,
branding), administrators (invite, edit, roles, suspend/reactivate), and the audit log. Design and
rationale: [`docs/F1-DESIGN.md`](docs/F1-DESIGN.md); what changed while building it:
[`docs/F1-AS-BUILT.md`](docs/F1-AS-BUILT.md).

Dashboard, subscriptions, features, monitoring, analytics, and settings are **deliberately absent** —
each needs a backend module that does not exist yet (M3–M7). A screen with nothing true to show does not
ship.

## Running it

```bash
pnpm install
pnpm gen:api        # regenerate DTO types from ../GymOS-Backend/contracts/openapi-v1.json
pnpm dev            # http://localhost:3000
```

A backend must be running on `http://localhost:5080` (override with `GYMOS_API_ORIGIN`). Start one per
[`tests/e2e/README.md`](tests/e2e/README.md).

**The API is proxied under this app's origin, and that is load-bearing** — the refresh cookie is
`SameSite=Strict` and the API sets no CORS, so a split origin breaks the session _after_ login appears
to work. See `next.config.ts`.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm test           # unit: API client, problem mapping, confirm dialog
pnpm test:e2e       # real browser + real backend, desktop and mobile viewports
node scripts/check-dependencies.mjs
```

## Standing rules

- API types are **generated from the backend's OpenAPI document** (AD-12/AD-37) — no hand-written DTO
  types. `src/types/api.d.ts` is generated; `src/types/api.ts` only re-exports from it.
- `usePermission()` hides UI but **never authorizes** (AD-5/AD-22). The API re-checks every request.
- The sidebar will render the permission- and feature-filtered tree from `GET /api/v1/navigation`; until
  the module manifest loader exists, `src/lib/nav/items.ts` filters client-side against `/auth/me`
  (F1-DESIGN.md D9 — a deferral, not a substitute).
- **Responsive is a requirement, not a polish pass.** Lists render as a table from `md` up and as cards
  below; the sidebar is a drawer below `lg`; touch targets are 44px until a pointer is in play. The E2E
  suite runs every journey at both sizes.
- Dependencies follow [`docs/DEPENDENCY_POLICY.md`](docs/DEPENDENCY_POLICY.md) — an allowlist, enforced
  in CI, changed in the same commit as the policy.
- UI scope obeys the Golden Rule (PRODUCT-PRINCIPLES.md): fewest clicks beats polish; screens ship
  trimmed against "does this reduce work?".
