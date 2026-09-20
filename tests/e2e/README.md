# Running the end-to-end suite

Nothing is mocked. The suite drives a real browser against this app's dev server, which proxies a real
GymOS-Backend on a real SQL Server — so it proves the same-origin proxy, the refresh cookie, and the
contract all line up. That is what unit tests cannot do.

## 1. SQL Server

The simplest route is the backend's own compose stack, which brings up the engine, creates the
database and both principals, and applies migrations in one command:

```bash
cd ../GymOS-Backend
docker compose up -d mssql db-init migrator
```

That leaves a container named `gymos-mssql` — which is what `global-setup.ts` defaults to — with the
database reachable on `localhost,1433`.

**Why not a bare `docker run` any more.** The PostgreSQL version of this step was one command, because
that image creates a database and a role from environment variables. SQL Server's image does neither,
and more importantly the API refuses to start against a database whose principals do not exist:
`TenantIsolationValidator` rejects any connection privileged enough to disable a security policy, so
connecting as `sa` fails the boot rather than working. Reusing the compose services is what keeps this
step from becoming a page of setup SQL.

If 1433 is already taken by a native SQL Server or LocalDB, set `MSSQL_PORT=1434` in the backend's
`.env` and adjust the connection string below.

## 2. Backend

```bash
cd ../GymOS-Backend
ASPNETCORE_ENVIRONMENT=Development \
ASPNETCORE_URLS=http://localhost:5080 \
ConnectionStrings__Database="Server=127.0.0.1,1433;Database=GymOS_Local;User Id=gymos_app;Password=Gymos_dev_app_password1;Encrypt=True;TrustServerCertificate=True;Current Language=us_english" \
Database__MigrateOnStartup=false \
Seed__SuperAdmin__Email=e2e@gymos.test \
Seed__SuperAdmin__Password=e2e-super-admin-password \
Security__RateLimiting__SignInAttemptsPerWindow=500 \
Security__RateLimiting__AnonymousRequestsPerMinute=5000 \
Security__RateLimiting__ApiRequestsPerMinute=100000 \
Jobs__Enabled=false \
Email__Enabled=false \
dotnet run --project src/Host/GymOS.WebApi
```

**Why `127.0.0.1`, not `localhost`.** `localhost` resolved to IPv6 on this machine and timed out; the
container binds `127.0.0.1`, so the connection string and `docker exec`/`sqlcmd` calls all target that
address explicitly rather than a name that can resolve either way.

**Why `Email__Enabled=false`.** `operations-journey.spec.ts`'s test-email step asserts the API's own
disabled-sender refusal (`settings.email_disabled`), which only fires while email is off.

**Why the raised sign-in limit.** Every test signs in fresh, because a fresh session per test is what
isolation means — and twenty of those trips the production-appropriate limit of 10 per minute per IP.
The limit is raised on the _test_ instance only; nothing about production config changes.

**Why the raised rate limits (F5 and later).** M7 added two _global_ limiters, on top of the
per-endpoint sign-in policy above, and the suite trips both.

`security.anonymous_requests_per_minute` (`Security:RateLimiting:AnonymousRequestsPerMinute`,
GymOS-Backend's `docs/BusinessRules/Settings.md` §8) defaults to 60 requests per minute per IP. Both
`POST /auth/login` and `POST /auth/refresh` are anonymous as far as this limiter is concerned: login
because there is no session yet, and refresh because the refresh cookie alone doesn't count as an
authenticated bearer request. Every test signs in fresh, and every `page.goto`/reload the suite does
triggers its own `POST /auth/refresh` — across 66+ tests that adds up to well over 60 anonymous
requests in a minute long before the sign-in-attempts policy above would ever trip. The symptom is not
an error dialog: refresh gets a `429`, the session is silently lost, the console bounces back to
`/login`, and whatever the test was waiting for (a `/dashboard` redirect, a nav link, a save) times out
at exactly 30s — scattered across arbitrary specs depending on which one happens to be mid-request when
the per-minute window fills.

`security.api_requests_per_minute` (`Security:RateLimiting:ApiRequestsPerMinute`, same document) is the
_authenticated_ counterpart, defaulting to 600 requests per minute per user. The whole suite signs in as
one user throughout a run, and a screen with several queries — the dashboard's panels, the monitoring
poll, four settings categories, the maintenance banner's own poll — adds up fast across 70+ tests
running in a couple of minutes; a burst over 600/min in that single user's window is enough to trip it.
The symptom here is not a lost session but a `429` on whichever `GET` the screen was mid-request on, so
the screen renders the API's own rate-limit sentence ("The rate limit for this caller has been
reached…") in place of its normal content — for example the Settings page's General tab.

Both are raised on the _test_ instance only; nothing about production config changes.

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
leaves **one out** (seven days ago), giving 13 rows with a single interior gap. That gap is what
proves F3-DESIGN **D3** — a missing day is drawn as a break and named in words — end to end rather
than only in the unit suite. The specs assert the sentence that gap produces, so:

- every date is relative to today (from `SYSUTCDATETIME()`), because hard-coded dates would drift out of the console's
  default range (last 30 days) and quietly return the specs to asserting nothing;
- two currencies are written, because against a single-currency screen a summed `Total` column and a
  per-currency column are the same column, and **D2** would be untestable;
- the population three (`active`/`suspended`/`provisioning`) sum to `total_gyms`, because the Growth
  screen stacks them to that height (**D4**).

`global-setup.ts` verifies the shape it just wrote and **throws** if it is not 13 rows with exactly 1
missing day, so drift in the SQL surfaces as one clear message before the browser starts rather than
as a puzzling assertion failure later. It reaches the database with `docker exec` rather than a
SQL Server client library — one INSERT is not worth a new dependency, and it needs no `sqlcmd` on the
host. Override `E2E_DB_CONTAINER` (default `gymos-mssql`), `E2E_DB_USER`, `E2E_DB_PASSWORD`, or
`E2E_DB_NAME` if yours differ.

The rows are deleted and rewritten on every run. That is safe precisely because this table is a read
model that is rebuilt nightly and never backfilled, so a test database's copy is disposable by
definition.

### A second account, seeded for you

`global-setup.ts` also runs `tests/e2e/seed-support-agent.sql`, which creates (or repairs)
`e2e-support@gymos.test`: an Active user holding the platform-scoped SupportAgent role.
`operations-journey.spec.ts` signs in as this account to prove that maintenance mode refuses a caller
without `settings.manage`, which the seeded SuperAdmin can never demonstrate — SuperAdmins always pass
(F5-DESIGN D7).

It is seeded **by SQL**, not by the normal invite flow, because inviting an administrator emails them
an activation link and this backend runs with email off (§2 above) — there is no way for the invitation
to be activated. Instead the seed copies the SuperAdmin's own `password_hash` onto the new user: Argon2
verification reads the salt and parameters from the hash string itself, so a copied hash verifies
correctly for a different account, and the SupportAgent signs in with the same password
(`e2e-super-admin-password`). The seed is idempotent — safe to run against a user a previous run already
created — and, like the `sa` credential above, is a local-container-only affordance.

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
cd ../GymOS-Backend && docker compose down -v
```

`operator-journey.spec.ts` provisions gyms named `e2e-<project>-<timestamp>` and deletes them as part of
its own journey. `billing-journey.spec.ts` provisions gyms named `e2e-billing-<project>-<timestamp>` and
does **not** delete them — nothing in F2 offers gym deletion beyond what F1 already exercises, and slugs
are never released anyway (F1-AS-BUILT.md), so nothing is gained by adding a teardown step. It also
creates a plan per run (`E2E_<PROJECT>_<timestamp>`) that is never deleted, because plans structurally
cannot be (D6, §3.4: `DELETE /plans/{id}` is a 405 by design). Both accumulate in whichever SQL Server
container is running the suite; the `down -v` above discards all of it along with the volume. If the same container stays up across many runs instead — the common case while
iterating on this suite — expect the gym and plan lists to grow with every run; that is the cost of D6,
not a leak to chase.

`feature-flags-journey.spec.ts` provisions a gym (`e2e-flags-<project>-<timestamp>`) and a plan
(`E2E_FLAGS_<PROJECT>_<timestamp>`) with a price, the same way and for the same reasons as above, and
likewise deletes neither. It also edits the platform's shared, seeded-once feature catalogue directly —
a description and a default-on/off flip — which are `docker rm -f`'s to undo as well: the catalogue is
insert-only (`FeatureCatalogSeeder`), so a restart does not revert an operator's edit, and the suite's
own assertions are written to expect "the opposite of whatever it already was" for exactly this reason.

`operations-journey.spec.ts` edits `general.platform_name` and resets it back to Database source and
then Default before finishing, turns maintenance mode on and off (restored in a `finally`, so a failed
assertion mid-test cannot leave the shared backend closed to the mobile project that runs next), and
leaves `audit.exported` entries behind from its own CSV export. None of this needs cleanup: the setting
ends the run at its default, maintenance ends the run off, and audit log entries are exactly the kind of
row this trail exists to accumulate.
