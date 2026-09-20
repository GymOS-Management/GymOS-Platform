import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The F5 operations-console journey, end to end and unmocked: sign in → Monitoring lists every
 * registered job as never having run and explains the outbox's own limits → a job's own history page
 * explains its emptiness → a General setting round-trips through Database and back to Default →
 * Email's "Test connection" reports the API's own disabled-sender refusal → Maintenance mode refuses a
 * SupportAgent and is always reopened afterwards → Audit log's CSV export downloads a real file and
 * records itself.
 *
 * Runs twice via playwright.config.ts: Desktop Chrome and iPhone 13. The mobile pass is the
 * responsiveness gate — every step must be completable through the drawer nav, same as the other
 * three journeys.
 *
 * ## The second account
 *
 * The maintenance step needs a caller the middleware actually refuses. Every other journey signs in
 * only as the SuperAdmin, who always passes (F5-DESIGN D7) — so this spec is the one place a second
 * account exists at all, seeded by SQL in global-setup.ts because email is off on the test backend and
 * an invitation cannot be activated without one (see seed-support-agent.sql).
 */

const SUPER_ADMIN = { email: 'e2e@gymos.test', password: 'e2e-super-admin-password' };
const SUPPORT_AGENT = { email: 'e2e-support@gymos.test', password: SUPER_ADMIN.password };

/** The dev server compiles each route on its first request; the 5s default does not cover that. */
const FIRST_LOAD = { timeout: 30_000 };

const runId = `${Date.now()}`.slice(-8);

/** Every job the host registers when Jobs__Enabled=false is still described to the API. */
const REGISTERED_JOBS = [
  'feature-override-sweep',
  'invoice-overdue',
  'platform-stats',
  'subscription-renewal',
  'retention',
];

/**
 * Text as the operator actually sees it — the same helper the other three journeys use, copied
 * rather than imported so each spec file stays self-contained.
 *
 * DataTable renders both a desktop table and mobile cards, hiding one with CSS, so every row's text
 * exists twice in the DOM; a bare getByText matches an element nobody at this viewport can see.
 */
function visibleText(scope: Page | Locator, text: string | RegExp) {
  return scope.getByText(text).filter({ visible: true });
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPER_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, FIRST_LOAD);
}

/**
 * Clicks a top-level sidebar link through whichever chrome the viewport offers.
 *
 * The persistent sidebar is `hidden lg:flex` (app-shell.tsx); below `lg` its links are
 * `display:none` — present in the DOM but outside the accessibility tree, so `getByRole` matches
 * *nothing* and a click on it hangs out the full timeout rather than failing fast. The drawer's own
 * copy of the link does not exist until the drawer button (accessible name "Open navigation") opens
 * it.
 */
async function openNavLink(page: Page, isMobile: boolean, label: string) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('link', { name: label, exact: true }).click();
}

/**
 * Clicks a plain (non-`DialogFooter`) "Save" button. On a narrow viewport a left-aligned Save can sit
 * behind `next dev`'s floating dev-tools indicator, so mobile dispatches the click event directly
 * rather than relying on Playwright's real-mouse actionability checks — see
 * `feature-flags-journey.spec.ts`'s own copy of this helper for the full explanation.
 */
async function clickSave(scope: Locator | Page, isMobile: boolean) {
  const save = scope.getByRole('button', { name: 'Save' });
  if (isMobile) {
    await save.dispatchEvent('click');
    return;
  }
  await save.click();
}

test.describe.serial('operations journey', () => {
  test('monitoring lists every registered job as not yet run', async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Monitoring');

    await expect(page.getByRole('heading', { name: 'Monitoring', level: 1 })).toBeVisible(
      FIRST_LOAD,
    );

    // At least one job row is visible, and every visible "Has not run yet" row really reads that —
    // not a hard count of five, because whether every REGISTERED_JOBS name is actually described to
    // the API when Jobs__Enabled=false is exactly what the loop below checks, one name at a time,
    // without failing hard on the first one that happens to be absent.
    const notRunYet = visibleText(page, 'Has not run yet');
    await expect(notRunYet.first()).toBeVisible();
    const notRunYetCount = await notRunYet.count();
    for (let index = 0; index < notRunYetCount; index += 1) {
      await expect(notRunYet.nth(index)).toHaveText('Has not run yet');
    }

    const missing: string[] = [];
    for (const name of REGISTERED_JOBS) {
      const row = visibleText(page, name).first();
      // `waitFor` (not a bare `isVisible()`, which never waits) decides both the diagnostic list
      // below and the per-name soft assertion from the same outcome, so the two can never disagree
      // about whether a name that is merely slow to render counts as present or missing.
      const present = await row
        .waitFor({ state: 'visible', timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (!present) {
        missing.push(name);
      }
      expect.soft(present, `expected job "${name}" to be listed on /monitoring`).toBe(true);
    }
    if (missing.length > 0) {
      // Deliberate: names which REGISTERED_JOBS were absent, per the controller ruling amending
      // brief test 1, rather than failing hard on the first one.
      console.log(`operations journey: job(s) not found on /monitoring: ${missing.join(', ')}`);
    }

    await expect(
      visibleText(
        page,
        'Depth only. Delivery lag and dead letters are reported once the outbox processor exists.',
      ),
    ).toBeVisible();
    await expect(visibleText(page, 'Healthy').first()).toBeVisible();
  });

  test("a job's history opens and explains its emptiness", async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Monitoring');
    await visibleText(page, 'retention').first().click();

    await expect(page.getByRole('heading', { name: 'retention', level: 1 })).toBeVisible(
      FIRST_LOAD,
    );
    await expect(visibleText(page, 'No runs recorded')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Status' })).toBeVisible();
  });

  test('a General setting moves to Database and back to Default', async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Settings');

    const input = page.getByLabel('Platform name');
    const original = await input.inputValue();
    await input.fill(`${original} ${runId}`);
    await clickSave(page, isMobile);

    // Scoped to the sonner toast region, the same way the maintenance toasts are: a bare getByText
    // is one strict-mode violation away the moment any other visible text on the page happens to
    // read "Settings saved." too, and scoping costs nothing when it doesn't.
    await expect(page.getByLabel(/Notifications/).getByText('Settings saved.')).toBeVisible();
    await expect(visibleText(page, 'Database').first()).toBeVisible();

    await page.getByRole('button', { name: 'Reset to default' }).click();
    await clickSave(page, isMobile);

    await expect(page.getByLabel(/Notifications/).getByText('Settings saved.')).toBeVisible();
    await expect(page.getByLabel('Platform name')).toHaveValue('GymOS');

    const generalPanel = page.getByRole('tabpanel', { name: 'General' });
    await expect(visibleText(generalPanel, 'Database')).toHaveCount(0);
  });

  test("test connection reports the API's own refusal", async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Settings');

    await page.getByRole('tab', { name: 'Email' }).click();
    await page.getByRole('button', { name: 'Test connection' }).click();

    await expect(
      visibleText(page, /Email is disabled; enable it and save before testing the connection\./),
    ).toBeVisible();
  });

  test('maintenance refuses a SupportAgent and reopens afterwards', async ({
    page,
    browser,
    isMobile,
  }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Settings');

    const message = `E2E maintenance ${runId}`;

    try {
      await page.getByRole('button', { name: 'Enable maintenance mode' }).click();

      const enableDialog = page.getByRole('dialog');
      await enableDialog.getByLabel('Message shown to refused callers').fill(message);
      await enableDialog.getByLabel('Type maintenance to confirm').fill('maintenance');
      await enableDialog.getByRole('button', { name: 'Enable maintenance mode' }).click();

      // Scoped to the sonner toast region rather than a bare getByText: the banner (asserted next)
      // renders the identical sentence at the same moment, since the mutation's onSuccess sets both
      // the toast and the banner's query cache in the same tick.
      await expect(
        page.getByLabel(/Notifications/).getByText('Maintenance mode is on.'),
      ).toBeVisible();
      await expect(page.getByRole('status')).toContainText('Maintenance mode is on.');

      const context = await browser.newContext();
      // Nested try/finally so this context always closes, even when the alert assertions below
      // throw — otherwise it leaked on a failed run, orphaning a browser context for the rest of
      // the worker's lifetime while the outer `finally` only knew to restore maintenance.
      try {
        const other = await context.newPage();
        await other.goto('/login');
        await other.getByLabel('Email').fill(SUPPORT_AGENT.email);
        await other.getByLabel('Password', { exact: true }).fill(SUPPORT_AGENT.password);
        await other.getByRole('button', { name: 'Sign in' }).click();

        // Next renders an empty `role="alert"` route announcer that also matches
        // (tests/e2e/README.md, "Writing assertions here") — filtered out by requiring the text the
        // announcer never carries.
        const alert = other.getByRole('alert').filter({ hasText: 'Maintenance in progress' });
        await expect(alert).toContainText('Maintenance in progress', FIRST_LOAD);
        await expect(alert).toContainText(message);
      } finally {
        await context.close();
      }
    } finally {
      // Runs whether or not the assertions above passed, so a failed run cannot leave the shared
      // backend closed for the mobile project that follows.
      await page.goto('/settings');
      const disableButton = page.getByRole('button', { name: 'Disable maintenance mode' });
      // `isVisible()` alone does not wait: right after `goto`, the Maintenance category's own query
      // is still pending (a skeleton renders in its place), so an immediate check races the fetch and
      // reads "not visible" even when maintenance is on. `waitFor` gives it a real window to resolve
      // one way or the other — timing out here means the Enable button rendered instead, i.e.
      // maintenance was never left on, not that the page failed to load.
      const stillEnabled = await disableButton
        .waitFor({ state: 'visible', timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      if (stillEnabled) {
        await disableButton.click();
        await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
        await expect(
          page.getByLabel(/Notifications/).getByText('Maintenance mode is off.'),
        ).toBeVisible();
      }
    }
  });

  test('export downloads a CSV with the header line', async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Audit log');

    await page.getByLabel('Filter by action').fill('settings.');
    await page.getByRole('button', { name: 'Export CSV' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('recorded in the audit log');

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^audit-logs-\d{8}-\d{8}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const [header] = Buffer.concat(chunks).toString('utf8').split('\r\n');
    expect(header).toBe(
      'id,created_at_utc,user_email,user_id,ip_address,action,entity_type,entity_id,correlation_id',
    );

    await page.reload();
    await page.getByLabel('Filter by action').fill('audit.');
    await expect(visibleText(page, 'audit.exported').first()).toBeVisible();
  });
});
