import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end against the real stack: this app's dev server proxying a real GymOS-Backend on a real
 * PostgreSQL. Nothing is mocked — the run proves the same-origin proxy, the refresh cookie, and the
 * contract all line up, which is precisely what unit tests cannot.
 *
 * Prerequisites (scripts/e2e.md): backend on :5080 with a seeded SuperAdmin
 * (e2e@gymos.test / e2e-super-admin-password), PostgreSQL in Docker.
 *
 * Two projects on purpose: the console must *work* at 375px, not merely not crash — the mobile pass
 * runs the same journeys through the drawer nav and card lists.
 */
/**
 * The dev server's port, overridable because 3000 is the default for every Next app on the machine.
 *
 * `reuseExistingServer` means a *different* project already holding 3000 is silently accepted as
 * ours — the suite then drives someone else's login form and fails with "Invalid email or password",
 * which looks like a seeding problem and is not. Setting `E2E_PORT` moves this run out of the way.
 */
const PORT = process.env.E2E_PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // The journeys share one backend's data; parallel runs would race.
  // One worker, so the desktop and mobile projects run sequentially too: two browsers hammering a
  // cold dev server's first-compile made the very first test flaky, and speed is not what E2E is for.
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Chromium with iPhone 13 emulation rather than real WebKit: `isMobile`, touch, and the 390px
    // viewport are what the responsive layout branches on, and one browser install covers both runs.
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
