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
dotnet run --project src/Host/GymOS.WebApi
```

**Why the raised sign-in limit.** Every test signs in fresh, because a fresh session per test is what
isolation means — and twenty of those trips the production-appropriate limit of 10 per minute per IP.
The limit is raised on the _test_ instance only; nothing about production config changes.

The obvious alternative — sign in once and share the session via Playwright's `storageState` — is
wrong for this backend specifically. The refresh cookie **rotates on every use**, and a replayed one is
treated as an attack that revokes the whole chain. A shared cookie file goes stale the moment the first
context refreshes, and the failure would look like random logouts rather than like the design working.

## 3. The suite

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

## Cleanup

```bash
docker rm -f gymos-e2e-db
```

Each run provisions gyms named `e2e-<project>-<timestamp>` and deletes them. Slugs are never released
by design, so nothing is reusable between runs — which is why the names carry a timestamp.
