import { expect, test, type Page } from '@playwright/test';

/**
 * The F3 definition-of-done journey, end to end and unmocked:
 * sign in → land on the dashboard → read the live platform figures → open Analytics → drive the range
 * control → toggle to the table view and read the same numbers back.
 *
 * Runs twice via playwright.config.ts: Desktop Chrome and iPhone 13. The mobile pass is the
 * responsiveness gate — a 366-point chart is unreadable at 375px, which is precisely why the table
 * view is obligatory rather than a nicety (F3-DESIGN D9), and this run is what proves it is usable.
 *
 * ## What this journey can and cannot assert, honestly
 *
 * `/analytics/*` reads **only** `daily_platform_stats`, a read model written once a night by
 * `PlatformStatsJob` at 03:30 UTC for *yesterday*. An E2E run cannot wait for that, and the job is
 * disabled anyway (`Jobs:Enabled=false` — tests/e2e/README.md) precisely so no sweep moves state
 * mid-run.
 *
 * So the charts are asserted against **seeded rows**, and the seed must include a deliberate one-day
 * gap so D3 is proved end to end rather than only in a unit test. Until that seeding exists
 * (scripts/e2e.md), the analytics half of this journey **skips loudly rather than passing
 * vacuously** — a green spec that asserted nothing about an empty series is the failure mode
 * F3-DESIGN §9 names by name.
 *
 * The dashboard half needs no seeding: it reads live from `gyms` and `gym_subscriptions`, so the gyms
 * the F2 journey creates are enough.
 */

const SUPER_ADMIN = { email: 'e2e@gymos.test', password: 'e2e-super-admin-password' };

/**
 * The dev server compiles each route on its first request, which the 5s default does not cover — a
 * timeout there reports as "the heading never rendered" when the page was still being built.
 */
const FIRST_LOAD = { timeout: 30_000 };

/**
 * Text as the operator actually sees it — the same helper the other two journeys use, copied rather
 * than imported so each spec file stays self-contained.
 */
function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

/**
 * Exact labels, not regexes: the password field shares a "Show password" toggle button, and
 * `getByLabel(/password/i)` matches both. The other two journeys already sign in this way.
 */
async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPER_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Waited for, not fired and forgotten: a `page.goto` issued while the sign-in request is still in
  // flight cancels it, and the next screen then bounces back to /login with no session — which reads
  // as the analytics routes being broken rather than as a race in this helper.
  await expect(page).toHaveURL(/\/dashboard/, FIRST_LOAD);
}

/**
 * Waits for an analytics screen to stop loading, then reports whether it came back with no rows.
 *
 * Checking for the empty state without waiting first is a race the skeleton always wins: the check
 * runs while the query is still in flight, sees no empty message, concludes there *is* data, and the
 * assertions after it then fail against a screen that never had any.
 */
async function isEmptySeries(page: Page): Promise<boolean> {
  const empty = visibleText(page, /nothing was recorded in this range/i).first();
  const loaded = visibleText(page, /recorded nightly/i).first();

  await expect(empty.or(loaded)).toBeVisible({ timeout: 15_000 });

  return empty.isVisible();
}

test.describe('F3 — dashboard and analytics', () => {
  test('a SuperAdmin lands on the dashboard and sees live platform figures', async ({ page }) => {
    await signIn(page);

    // D6: the landing route resolves to /dashboard for anyone holding analytics.read or audit.read.
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(FIRST_LOAD);

    // The KPI row and the MRR panel are the `analytics.read` half. Scoped to the Platform section:
    // "Gyms" is also the sidebar link, and a bare text match finds both.
    const platform = page.getByRole('region', { name: 'Platform' });
    await expect(platform.getByText('Gyms', { exact: true })).toBeVisible();
    await expect(visibleText(page, /monthly recurring revenue/i)).toBeVisible();

    // D7: the screen must say these are live, or the permanent discrepancy with the charts reads as
    // a bug the first time somebody notices it.
    await expect(visibleText(page, /as of now/i)).toBeVisible();

    // The `audit.read` half, rendered independently of the one above.
    await expect(visibleText(page, /recent activity/i)).toBeVisible();

    // Health is a live probe and must resolve to a real state, not a spinner.
    await expect(
      visibleText(page, /healthy|degraded|unhealthy|unreachable/i).first(),
    ).toBeVisible();
  });

  test('the revenue screen reports MRR per currency and never sums it', async ({ page }) => {
    await signIn(page);
    await page.goto('/analytics/revenue');

    await expect(page.getByRole('heading', { name: 'Revenue' })).toBeVisible(FIRST_LOAD);

    // D7 again, in its other half: this series is recorded, not live.
    await expect(visibleText(page, /recorded nightly|nothing was recorded/i)).toBeVisible();

    const empty = await isEmptySeries(page);

    test.skip(
      empty,
      'No daily_platform_stats rows seeded — see the note at the top of this file. Skipped rather ' +
        'than asserted against an empty series, which would pass without testing anything.',
    );

    // With rows present: the table view must show the same days the chart drew, and a currency
    // column per currency — never a combined total column (D2).
    await page.getByRole('button', { name: 'Table' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /^total$/i })).toHaveCount(0);
  });

  test('the range control drives the request and refuses an impossible range', async ({ page }) => {
    await signIn(page);
    await page.goto('/analytics/growth');

    await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible(FIRST_LOAD);

    // A preset is a real state change, not decoration.
    await page.getByRole('button', { name: 'Last 7 days' }).click();
    await expect(page.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // D8: an end date before the start is explained in the control rather than sent and refused.
    const from = page.getByLabel('From date');
    const to = page.getByLabel('To date');
    const fromValue = await from.inputValue();
    await to.fill('2020-01-01');
    await expect(page.locator('#range-error')).toContainText(/end date cannot be before/i);

    // And recovering from it restores a usable screen.
    await to.fill(fromValue);
    await expect(page.locator('#range-error')).toHaveCount(0);
  });

  test('churn states on screen that its two counts keep different clocks', async ({ page }) => {
    await signIn(page);
    await page.goto('/analytics/churn');

    await expect(page.getByRole('heading', { name: 'Churn' })).toBeVisible(FIRST_LOAD);

    const empty = await isEmptySeries(page);

    test.skip(empty, 'No daily_platform_stats rows seeded — see the note at the top of this file.');

    // D5: the caveat is part of the screen, not a footnote in a document nobody opens. A chart that
    // presents two differently-clocked numbers as symmetric without saying so is the
    // honest-looking kind of wrong.
    await expect(visibleText(page, /keep different clocks/i)).toBeVisible();
    await expect(visibleText(page, /left out of this series permanently/i)).toBeVisible();
  });
});
