import { expect, test, type Page } from '@playwright/test';

/**
 * The F1 definition-of-done journey, end to end and unmocked:
 * sign in → provision → activate → suspend with a reason → edit branding → delete with the typed
 * confirmation → find it all in the audit log.
 *
 * Runs twice via playwright.config.ts: Desktop Chrome and iPhone 13. The mobile pass is the
 * responsiveness gate — every step must be completable through the drawer nav and card lists.
 */

const SUPER_ADMIN = { email: 'e2e@gymos.test', password: 'e2e-super-admin-password' };

/**
 * Text as the operator actually sees it.
 *
 * DataTable renders both a desktop table and mobile cards, hiding one with CSS — so every row's text
 * exists twice in the DOM and a bare getByText matches an element nobody can click. Filtering to the
 * visible one is what makes these assertions mean "the operator can see this at this viewport",
 * which is the point of running the suite at two sizes.
 */
function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

/**
 * Unique per run AND per project: slugs are never released (a deleted gym keeps its address
 * forever), so the desktop and mobile passes must each provision their own gym, and a re-run must
 * never reuse an old one.
 */
const runId = `${Date.now()}`.slice(-8);
const gym = { slug: '', name: '' };

test.beforeAll(() => {
  const project = test.info().project.name;
  gym.slug = `e2e-${project}-${runId}`;
  gym.name = `E2E ${project} ${runId}`;
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPER_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // 30s rather than the 5s default: sign-in lands on /dashboard since F3, and the dev server
  // compiles that route on the first request of a run — a timeout here reads as a broken redirect.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe.serial('operator journey', () => {
  /**
   * **This test's premise changed in F3, and the rename is the point.** It used to read "lands on
   * the gyms list, not a dashboard of zeroes", because F1 deliberately had no dashboard: M5's stats
   * jobs did not exist, and a grid of zeroes teaches operators to distrust the screen.
   *
   * M5 shipped those figures and F3 built the screen, so the deferral is discharged and the landing
   * route is the dashboard for anyone holding `analytics.read` or `audit.read` (F3-DESIGN D6). Gyms
   * remains the fallback for a caller holding neither — asserted in the unit suite, where a role
   * without those permissions can be constructed.
   */
  test('signs in and lands on a dashboard that has real figures on it', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // The gyms list is still one click away, and is still where the operator does most of the work.
    //
    // On a phone that click starts at the drawer button. The persistent sidebar is `hidden lg:flex`
    // (app-shell.tsx), so below `lg` its "Gyms" anchor is `display:none` — present in the DOM but
    // outside the accessibility tree, which is why `getByRole` matches *nothing* rather than matching
    // something unclickable. The drawer's own copy does not exist until the drawer is open. Skipping
    // this branch is what made the mobile pass hang for the full timeout on a locator that could
    // never resolve.
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
    }

    await page.getByRole('link', { name: 'Gyms' }).first().click();
    await expect(page.getByRole('heading', { name: 'Gyms' })).toBeVisible();
  });

  test('a page reload keeps the operator signed in (memory token + refresh cookie)', async ({
    page,
  }) => {
    await signIn(page);
    // Reloaded on a data screen rather than the landing route, so the assertion below is about the
    // session surviving rather than about wherever sign-in happens to land (F3 moved that).
    await page.goto('/gyms');
    await page.reload();

    // The token was in memory and is gone; only the httpOnly cookie can restore the session.
    await expect(page.getByRole('heading', { name: 'Gyms' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('provisions a gym and sees it in Provisioning', async ({ page }) => {
    await signIn(page);
    await page.goto('/gyms');

    // .first(): when the list is empty, the header action and the empty-state action both offer it.
    await page
      .getByRole('link', { name: /provision gym/i })
      .first()
      .click();
    await page.getByLabel(/address \(slug\)/i).fill(gym.slug);
    await page.getByLabel('Gym name').fill(gym.name);
    await page.getByLabel('Owner name').fill('E2E Owner');
    await page.getByLabel('Owner email').fill('owner@e2e.test');
    await page.getByRole('button', { name: 'Provision gym' }).click();

    await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible();
    await expect(page.getByText('Provisioning')).toBeVisible();
  });

  test('a duplicate slug is refused with the taken-address message on the field', async ({
    page,
  }) => {
    await signIn(page);

    await page.goto('/gyms/new');
    await page.getByLabel(/address \(slug\)/i).fill(gym.slug);
    await page.getByLabel('Gym name').fill('Imposter Gym');
    await page.getByLabel('Owner name').fill('Nobody');
    await page.getByLabel('Owner email').fill('nobody@e2e.test');
    await page.getByRole('button', { name: 'Provision gym' }).click();

    // Targeted at the slug field's own error node: Next renders an empty role="alert" route
    // announcer, so a bare getByRole('alert') finds that instead. This also asserts D8 — the code
    // landed on the field it names, not in a banner.
    await expect(page.locator('#slug-error')).toContainText(/already in use/i);
  });

  test('activates, then suspends with a reason the detail page shows', async ({ page }) => {
    await signIn(page);
    await openGym(page);

    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Suspend' }).click();
    await page.getByLabel('Reason').fill('E2E: non-payment rehearsal');
    await page.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();

    await expect(page.getByText(/suspended: e2e: non-payment rehearsal/i)).toBeVisible();
  });

  test('edits branding; the change survives a reload', async ({ page }) => {
    await signIn(page);
    await openGym(page);

    await page.getByRole('tab', { name: 'Branding' }).click();
    await page.getByLabel('Primary colour').fill('#1A2B3C');
    await page.getByLabel('Email sender name').fill('E2E Gym Mail');
    await page.getByRole('button', { name: 'Save branding' }).click();
    await expect(page.getByText('Branding saved.')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Branding' }).click();
    await expect(page.getByLabel('Primary colour')).toHaveValue('#1A2B3C');
  });

  test('delete requires the typed slug: wrong is refused in-place, right lands back on the list', async ({
    page,
  }) => {
    await signIn(page);
    await openGym(page);

    await page.getByRole('button', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog');

    // The confirm button is dead until something is typed.
    await expect(dialog.getByRole('button', { name: 'Delete gym' })).toBeDisabled();

    // A wrong slug is sent, refused by the API, and the refusal stays inside the dialog.
    await dialog.getByLabel(/type the gym/i).fill('some-other-gym');
    await dialog.getByRole('button', { name: 'Delete gym' }).click();
    await expect(dialog.getByRole('alert')).toContainText(/did not match/i);

    // The right slug deletes and returns to the list.
    await dialog.getByLabel(/type the gym/i).fill(gym.slug);
    await dialog.getByRole('button', { name: 'Delete gym' }).click();
    await expect(page).toHaveURL(/\/gyms$/);
  });

  test('the deleted gym is out of the default list but findable with includeDeleted', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/gyms');

    await page.getByLabel('Search gyms').fill(gym.slug);
    await expect(visibleText(page, /no gyms match/i).first()).toBeVisible();

    await page.getByLabel(/include deleted/i).check();
    await expect(visibleText(page, gym.name).first()).toBeVisible();
    await expect(visibleText(page, 'Deleted').first()).toBeVisible();
  });

  test('the whole story is in the audit log', async ({ page }) => {
    await signIn(page);

    await page.goto('/audit-logs');
    await page.getByLabel('Filter by action').fill('gym.');

    await expect(visibleText(page, 'gym.created').first()).toBeVisible();
    await expect(visibleText(page, 'gym.updated').first()).toBeVisible();

    // The diff viewer opens and shows captured values.
    await visibleText(page, 'gym.created').first().click();
    await expect(page.getByRole('dialog')).toContainText(/slug/i);
  });

  test('navigation works through whichever chrome the viewport offers', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);

    if (isMobile) {
      // The sidebar is a drawer on a phone: open it, navigate, and confirm it closed itself.
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await page.getByRole('link', { name: 'Audit log', exact: true }).click();
      await expect(page).toHaveURL(/\/audit-logs/);
      await expect(page.getByRole('link', { name: 'Administrators' })).toBeHidden();
    } else {
      await page.getByRole('link', { name: 'Audit log', exact: true }).click();
      await expect(page).toHaveURL(/\/audit-logs/);
    }
  });
});

/** Finds the run's gym from the list, through whichever nav the viewport offers. */
async function openGym(page: Page) {
  await page.goto('/gyms');
  await page.getByLabel('Search gyms').fill(gym.slug);
  await page.getByLabel(/include deleted/i).check(); // late steps revisit a suspended gym
  await visibleText(page, gym.name).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible();
}
