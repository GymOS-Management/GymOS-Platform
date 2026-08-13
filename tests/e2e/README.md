# Running the end-to-end suite

Nothing is mocked. The suite drives a real browser against this app's dev server, which proxies a real
GymOS-Backend on a real PostgreSQL — so it proves the same-origin proxy, the refresh cookie, and the
contract all line up. That is what unit tests cannot do.

## 1. PostgreSQL

```bash
docker run -d --name gymos-e2e-db \
  -e POSTGRES_USER=gymos -e POSTGRES_PASSWORD=gymos -e POSTGRES_DB=gymos \
  -p 5433:5432 postgres:17-alpine
```

Port 5433, not 5432: a natively installed PostgreSQL wins the race for 5432 on many machines (see the
backend's `docs/STATUS.md`).

## 2. Backend

```bash
cd ../GymOS-Backend
ASPNETCORE_ENVIRONMENT=Development \
ASPNETCORE_URLS=http://localhost:5080 \
ConnectionStrings__Database="Host=localhost;Port=5433;Database=gymos;Username=gymos;Password=gymos" \
Seed__SuperAdmin__Email=e2e@gymos.test \
Seed__SuperAdmin__Password=e2e-super-admin-password \
Security__RateLimiting__SignInAttemptsPerWindow=500 \
Jobs__Enabled=false \
dotnet run --project src/Host/GymOS.WebApi
```

**Why the raised sign-in limit.** Every test signs in fresh, because a fresh session per test is what
isolation means — and twenty of those trips the production-appropriate limit of 10 per minute per IP.
The limit is raised on the _test_ instance only; nothing about production config changes.

**Why jobs are disabled (F2 and later).** `billing-journey.spec.ts` asserts on subscription and invoice
status. The renewal sweep runs every 15 minutes and the overdue sweep hourly (F2-DESIGN.md §9); either
one firing mid-run could relabel the exact row a test is mid-assertion on — a subscription becoming
`PastDue`, or a race with an invoice's status — for reasons that have nothing to do with the screen under
test. `Jobs__Enabled=false` on the _test_ instance removes that source of flakiness deliberately, rather
than hoping a run finishes inside whatever window the sweeps leave free. Confirm it took effect in the
backend's own startup log before trusting a long run's results.

The obvious alternative — sign in once and share the session via Playwright's `storageState` — is
wrong for this backend specifically. The refresh cookie **rotates on every use**, and a replayed one is
treated as an attack that revokes the whole chain. A shared cookie file goes stale the moment the first
context refreshes, and the failure would look like random logouts rather than like the design working.

## 3. Analytics rows, seeded for you

Nothing to run: `globalSetup` (`tests/e2e/global-setup.ts`) writes `platform.daily_platform_stats`
before the browsers start, from `tests/e2e/seed-analytics.sql`.

It is seeded rather than waited for because `/analytics/*` reads **only** that read model, which
`PlatformStatsJob` compiles once a night for _yesterday_ — and the job host is disabled during the
suite anyway (above). Mocking the response instead would test the charts against a fake and prove
nothing about the proxy or the contract, which is the one thing this suite exists to prove.

**The seed's shape is load-bearing, not arbitrary.** It writes 14 candidate days ending yesterday and
leaves **one out** (`CURRENT_DATE - 7`), giving 13 rows with a single interior gap. That gap is what
proves F3-DESIGN **D3** — a missing day is drawn as a break and named in words — end to end rather
than only in the unit suite. The specs assert the sentence that gap produces, so:

- every date is relative to `CURRENT_DATE`, because hard-coded dates would drift out of the console's
  default range (last 30 days) and quietly return the specs to asserting nothing;
- two currencies are written, because against a single-currency screen a summed `Total` column and a
  per-currency column are the same column, and **D2** would be untestable;
- the population three (`active`/`suspended`/`provisioning`) sum to `total_gyms`, because the Growth
  screen stacks them to that height (**D4**).

`global-setup.ts` verifies the shape it just wrote and **throws** if it is not 13 rows with exactly 1
missing day, so drift in the SQL surfaces as one clear message before the browser starts rather than
as a puzzling assertion failure later. It reaches the database with `docker exec` rather than a
Postgres client library — one INSERT is not worth a new dependency, and it needs no `psql` on the
host. Override `E2E_DB_CONTAINER` (default `gymos-e2e-db`), `E2E_DB_USER`, or `E2E_DB_NAME` if yours
differ.

The rows are deleted and rewritten on every run. That is safe precisely because this table is a read
model that is rebuilt nightly and never backfilled, so a test database's copy is disposable by
definition.

## 4. The suite

```bash
pnpm test:e2e                      # both viewports
pnpm exec playwright test --project=desktop
pnpm exec playwright test --project=mobile
```

Two projects, same journeys: Desktop Chrome and iPhone 13 emulation. The mobile pass is the
responsiveness gate — every step must be completable through the drawer nav and the card lists, not
merely render without crashing.

## Writing assertions here

Use the `visibleText` helper, not a bare `getByText`. `DataTable` renders **both** a desktop table and
mobile cards and hides one with CSS, so every row's text exists twice in the DOM; a bare locator will
happily match the element nobody can see, and the failure message ("resolved to 2 elements", or
"element is not visible") does not point at the cause.

Likewise, prefer a specific error node (`#slug-error`) over `getByRole('alert')`: Next renders an empty
`role="alert"` route announcer that matches first.

## 5. Cleanup

```bash
docker rm -f gymos-e2e-db
```

`operator-journey.spec.ts` provisions gyms named `e2e-<project>-<timestamp>` and deletes them as part of
its own journey. `billing-journey.spec.ts` provisions gyms named `e2e-billing-<project>-<timestamp>` and
does **not** delete them — nothing in F2 offers gym deletion beyond what F1 already exercises, and slugs
are never released anyway (F1-AS-BUILT.md), so nothing is gained by adding a teardown step. It also
creates a plan per run (`E2E_<PROJECT>_<timestamp>`) that is never deleted, because plans structurally
cannot be (D6, §3.4: `DELETE /plans/{id}` is a 405 by design). Both accumulate in whichever Postgres
container is running the suite; `docker rm -f` above (with no volume declared) discards all of it along
with the container. If the same container stays up across many runs instead — the common case while
iterating on this suite — expect the gym and plan lists to grow with every run; that is the cost of D6,
not a leak to chase.
