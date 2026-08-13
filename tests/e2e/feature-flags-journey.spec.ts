import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The F4 definition-of-done journey, end to end and unmocked:
 * sign in → build a plan and a gym that can actually reach layer 2 → see the catalogue → edit a
 * feature's copy → flip a platform default → watch a gym resolve at `source: Plan` → grant an
 * override that differs from the plan → withdraw it by setting the value back → watch the override
 * disappear → set the plan's own opinions and see them survive a reload.
 *
 * Runs twice via playwright.config.ts: Desktop Chrome and iPhone 13. The mobile pass is the
 * responsiveness gate — every step must be completable through the drawer nav, same as the other
 * three journeys.
 *
 * ## Why fixtures are mandatory, not a convenience
 *
 * `GET /gyms/{id}/features` resolves `override ?? plan ?? platform default` (Features.md). A gym with
 * no LIVE subscription has no plan opinion to inherit, so it can only ever resolve at layer 3 —
 * `source: Plan` is *unreachable* without a real subscription. This journey therefore provisions a
 * gym, creates a plan, prices it (assigning needs a price — billing-journey.spec.ts's own
 * `AssignPlanDialog` derives billing cycle and currency from the plan's prices), gives the plan an
 * opinion on the one feature the gym-tab steps exercise, and assigns it — all before the first
 * `source: Plan` assertion.
 *
 * ## Why the assertions are relative, not absolute
 *
 * The feature catalogue (`PlatformFeatures.All`, GymOS-Backend) is seeded **insert-only**: once a row
 * exists, its name/description/category/default/premium are the operator's, and the seeder never
 * touches them again (`FeatureCatalogSeeder`'s own remarks). That means this suite's own edits to the
 * catalogue in an earlier run — flipping a default, editing a description — are still sitting in the
 * database the next time it runs, on the same shared Postgres container. Every assertion here is
 * therefore phrased as "the opposite of whatever it already was", never "on" or "off" by name, so a
 * second run against an already-mutated catalogue still passes. The plan and the gym this run creates
 * are unique per run and per project (same reasoning as billing-journey.spec.ts), so nothing about
 * *those* needs to be relative.
 */

const SUPER_ADMIN = { email: 'e2e@gymos.test', password: 'e2e-super-admin-password' };

/** The dev server compiles each route on its first request; the 5s default does not cover that. */
const FIRST_LOAD = { timeout: 30_000 };

/**
 * Text as the operator actually sees it — the same helper the other three journeys use, copied
 * rather than imported so each spec file stays self-contained.
 *
 * DataTable renders both a desktop table and mobile cards, hiding one with CSS, so every row's text
 * exists twice in the DOM; a bare getByText matches an element nobody at this viewport can see.
 * `FeatureCatalogueTable`/`GymFeaturesList`/`PlanFeaturesList` are not DataTables (no dual desktop/
 * mobile rendering), but this is used throughout anyway, matching tests/e2e/README.md's rule rather
 * than special-casing the one journey that happens not to need it.
 */
function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

/**
 * Scopes a locator to one feature's own row, on whichever of the three feature screens is on screen
 * (`/features`, a gym's Features tab, a plan's Features tab). All three render one catalogue key per
 * row in a `rounded-md border p-3` container carrying that key as `<code>{key}</code>` — the same
 * shape reused by `feature-catalogue-table.tsx`, `gym-features-tab.tsx` and `plan-features-card.tsx`.
 * Scoping by key (rather than name) sidesteps a feature named "Analytics" colliding with the sidebar's
 * own "Analytics" link or with the /analytics/* routes.
 */
function featureRow(page: Page, key: string) {
  // Scoped to the row's own `<code>` element, anchored to match the key exactly — a plain
  // `hasText: key` also matches a *different* row whose prose happens to contain the same substring
  // (e.g. Analytics' description ends "...beyond standard reports", which contains "reports").
  return page.locator('.rounded-md.border.p-3').filter({
    has: page.locator('code', { hasText: new RegExp(`^${key}$`, 'i') }),
  });
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
 * it. Skipping this branch is exactly what silently skipped nine tests before — see task-10-brief.md.
 */
async function openNavLink(page: Page, isMobile: boolean, label: string) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await page.getByRole('link', { name: label, exact: true }).click();
}

/**
 * Clicks a plain (non-`DialogFooter`) "Save" button — `FeatureEditForm`'s own Save/Cancel row, and
 * `GymFeaturesList`'s page-level Save button, both lay their button out left-aligned rather than
 * inside `DialogFooter` (whose `sm:justify-end` every confirmation dialog in this console uses,
 * which is why *those* buttons click fine on mobile). On a narrow viewport that leaves the button
 * sitting at the bottom-left, exactly where `next dev`'s floating dev-tools indicator is fixed —
 * Playwright's real mouse click lands on the indicator instead and times out, mobile-only.
 * `dispatchEvent` fires the click straight at the button node — no coordinates, no hit-testing —
 * which is the fix for chrome that exists only because this is a dev server; a production click
 * would never hit it.
 */
async function clickSave(scope: Locator | Page) {
  await scope.getByRole('button', { name: 'Save' }).dispatchEvent('click');
}

/** Finds this run's gym from the list, through whichever nav the viewport offers. */
async function openGym(page: Page, isMobile: boolean) {
  await openNavLink(page, isMobile, 'Gyms');
  await page.getByLabel('Search gyms').fill(gym.slug);
  await visibleText(page, gym.name).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible(FIRST_LOAD);
}

/**
 * Unique per run AND per project, same reasoning as the other three journeys: plans cannot be
 * deleted (D6) and gym slugs are never released, so a re-run — or the mobile pass right after the
 * desktop one — must never collide with what came before.
 */
const runId = `${Date.now()}`.slice(-8);
const plan = { code: '', name: '', id: '' };
const gym = { slug: '', name: '' };

/**
 * The catalogue's own twelve keys and six categories (`PlatformFeatures.All`, GymOS-Backend). Fixed
 * on purpose: keys are code-canonical and not runtime-creatable, so unlike the plan/gym fixtures
 * above these are the same twelve on every run against this backend, not per-run values.
 */
const ALL_CATEGORIES = ['Operations', 'Insights', 'Members', 'Training', 'Growth', 'Integrations'];
const ALL_KEYS = [
  'pos',
  'inventory',
  'reports',
  'crm',
  'nutrition',
  'workout_builder',
  'member_app',
  'marketing',
  'analytics',
  'ai_assistant',
  'gateway',
  'access_control',
];

/** Gets a plan opinion in step 2, then carries `source: Plan` through the grant/withdraw pair. */
const PLAN_FEATURE = { key: 'gateway', name: 'Gateway' };
/** Starts `default` (no plan opinion), set to `Default` explicitly in step 9. */
const DEFAULT_FEATURE = { key: 'reports', name: 'Reports' };
/** Never touched before step 9, where it is set `Excluded`. */
const EXCLUDED_FEATURE = { key: 'crm', name: 'CRM' };
/** Copy-edited in step 4. Distinct from the others so that test reads independently of them. */
const COPY_FEATURE = { key: 'inventory', name: 'Inventory' };
/** Default-flipped in step 5. Distinct again, so the confirmation's blast radius is its own. */
const FLIP_FEATURE = { key: 'access_control', name: 'Access control' };

test.beforeAll(() => {
  const project = test.info().project.name;
  plan.code = `E2E_FLAGS_${project.toUpperCase()}_${runId}`;
  plan.name = `E2E Flags Plan ${project} ${runId}`;
  gym.slug = `e2e-flags-${project}-${runId}`;
  gym.name = `E2E Flags ${project} ${runId}`;
});

test.describe.serial('feature flags journey', () => {
  test('creates a plan with a unique code', async ({ page }) => {
    await signIn(page);
    await page.goto('/plans/new');
    await page.getByLabel('Code').fill(plan.code);
    await page.getByLabel('Name').fill(plan.name);
    await page.getByRole('button', { name: 'Create plan' }).click();

    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/i);
    plan.id = page.url().split('/').pop()!;

    const heading = page.getByRole('heading', { name: new RegExp(plan.name) });
    await expect(heading).toBeVisible();
  });

  test('prices the plan so it can be assigned', async ({ page }) => {
    await signIn(page);
    await page.goto(`/plans/${plan.id}`);

    await page.getByRole('tab', { name: 'Prices' }).click();
    await page.getByRole('button', { name: 'Add price' }).click();
    // Billing cycle defaults to Monthly and currency to EUR (price-editor.tsx) — both already what
    // AssignPlanDialog needs, so only the amount is filled, same as billing-journey.spec.ts.
    await page.getByLabel('Amount').fill('19.99');
    await page.getByRole('button', { name: 'Save price' }).click();

    await expect(page.getByText('Price saved.')).toBeVisible();
    await expect(visibleText(page, /19\.99/).first()).toBeVisible();
  });

  test("sets the plan's own opinion on two features, ready for the gym steps and step 9", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/plans/${plan.id}`);
    await page.getByRole('tab', { name: 'Features' }).click();

    // PLAN_FEATURE goes Included so the gym below can resolve `source: Plan` — that source is
    // unreachable without a plan opinion (see the file header). DEFAULT_FEATURE also goes Included
    // here so that step 9 can set it back to `Default` and prove that transition persists too,
    // rather than clicking a button that was already selected.
    await featureRow(page, PLAN_FEATURE.key).getByRole('button', { name: 'Included' }).click();
    await featureRow(page, DEFAULT_FEATURE.key).getByRole('button', { name: 'Included' }).click();
    await clickSave(page);

    await expect(
      featureRow(page, PLAN_FEATURE.key).getByRole('button', { name: 'Included' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      featureRow(page, DEFAULT_FEATURE.key).getByRole('button', { name: 'Included' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('provisions the gym that will carry the subscription', async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Gyms');

    await page
      .getByRole('link', { name: /provision gym/i })
      .first()
      .click();
    await page.getByLabel(/address \(slug\)/i).fill(gym.slug);
    await page.getByLabel('Gym name').fill(gym.name);
    await page.getByLabel('Owner name').fill('E2E Flags Owner');
    await page.getByLabel('Owner email').fill('flags-owner@e2e.test');
    await page.getByRole('button', { name: 'Provision gym' }).click();

    await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible();
  });

  test('assigns the plan to the gym — the only way source: Plan becomes reachable', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openGym(page, isMobile);

    await page.getByRole('tab', { name: 'Subscription' }).click();
    await page.getByRole('button', { name: 'Assign plan' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Plan').click();
    await page.getByRole('option', { name: new RegExp(plan.name) }).click();
    await dialog.getByRole('button', { name: 'Assign plan' }).click();

    await expect(page.getByText('Plan assigned.')).toBeVisible();
    const subscriptionHeading = page.getByRole('heading', { name: new RegExp(plan.name) });
    await expect(subscriptionHeading).toBeVisible();
    await expect(subscriptionHeading).toContainText('Active');
  });

  test('the catalogue lists all twelve features under their six category headings', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Features');

    await expect(page.getByRole('heading', { name: 'Features', level: 1 })).toBeVisible(
      FIRST_LOAD,
    );

    for (const category of ALL_CATEGORIES) {
      await expect(page.getByRole('heading', { level: 3, name: category, exact: true })).toBeVisible();
    }

    // Every key renders exactly once — twelve distinct rows, not merely "some rows under six
    // headings" (which a catalogue missing half its keys would also satisfy).
    for (const key of ALL_KEYS) {
      await expect(featureRow(page, key)).toHaveCount(1);
    }
  });

  test("edits a feature's copy, and the change survives a reload", async ({ page, isMobile }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Features');

    await featureRow(page, COPY_FEATURE.key).getByRole('button', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog');
    const description = dialog.getByLabel('Description');
    const original = await description.inputValue();
    // Appended rather than replaced outright, and stamped with runId: two consecutive runs against
    // the same shared catalogue (see the file header) must each produce a description this run's own
    // assertion can find, not a fixed string the previous run already wrote.
    const updated = `${original} (e2e ${runId})`;
    await description.fill(updated);
    await clickSave(dialog);

    await expect(page.getByText('Feature updated.')).toBeVisible();
    await expect(visibleText(page, updated).first()).toBeVisible();

    await page.reload();
    await expect(visibleText(page, updated).first()).toBeVisible();
  });

  test('flipping a platform default warns that the affected count is unknown, then applies', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openNavLink(page, isMobile, 'Features');

    await featureRow(page, FLIP_FEATURE.key).getByRole('button', { name: 'Edit' }).click();

    const dialog = page.getByRole('dialog');
    const defaultCheckbox = dialog.getByRole('checkbox', { name: 'Enabled by default' });
    const wasChecked = await defaultCheckbox.isChecked();
    await defaultCheckbox.setChecked(!wasChecked);
    await clickSave(dialog);

    // D4: the widest-blast-radius write in the module re-answers every gym with neither an override
    // nor a plan opinion, and the API exposes no count of how many that is — the confirmation says so
    // rather than inventing a number from the adoption/override counts it does have.
    await expect(
      visibleText(page, /cannot tell you exactly how many gyms follow the default/i),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Change default' }).click();

    await expect(page.getByText('Feature updated.')).toBeVisible();
    const expectedBadge = `Default ${wasChecked ? 'off' : 'on'}`;
    await expect(visibleText(page, expectedBadge).first()).toBeVisible();
  });

  test("the gym's Features tab resolves the plan's opinion: source Plan", async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openGym(page, isMobile);
    await page.getByRole('tab', { name: 'Features' }).click();

    const row = featureRow(page, PLAN_FEATURE.key);
    await expect(row.getByText('Plan', { exact: true })).toBeVisible();
    await expect(row.getByText('On', { exact: true })).toBeVisible();
  });

  const OVERRIDE_REASON = 'E2E: goodwill trial, revisit at renewal';

  test('granting an override that differs from the plan records who, why, and how long ago', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openGym(page, isMobile);
    await page.getByRole('tab', { name: 'Features' }).click();

    // The plan says Gateway is on (previous test); an override that *differs* must turn it off.
    await page.getByRole('switch', { name: PLAN_FEATURE.name }).setChecked(false);
    await page.getByLabel(`Reason for ${PLAN_FEATURE.name}`).fill(OVERRIDE_REASON);
    await clickSave(page);

    await expect(visibleText(page, `${PLAN_FEATURE.name} is now off (Override)`)).toBeVisible();

    const row = featureRow(page, PLAN_FEATURE.key);
    await expect(row.getByText('Override', { exact: true })).toBeVisible();
    await expect(row.getByText('Off', { exact: true })).toBeVisible();
    await expect(row.getByText(`Reason: ${OVERRIDE_REASON}`)).toBeVisible();
    await expect(row.getByText(`Set by ${SUPER_ADMIN.email}`)).toBeVisible();
    // Granted moments ago, so 0 or more whole days — and, unlike the review marker nearby, it never
    // expires on its own (Features.md; overrideAge.ts).
    await expect(row.getByText(/Granted \d+ days? ago\. Does not expire\./)).toBeVisible();
  });

  const WITHDRAW_REASON = 'E2E: reverting to the plan value';

  test('setting the value back to the plan withdraws the override — the headline invariant', async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await openGym(page, isMobile);
    await page.getByRole('tab', { name: 'Features' }).click();

    const row = featureRow(page, PLAN_FEATURE.key);
    // Confirms the override from the previous test is actually in place before withdrawing it —
    // otherwise this test could "pass" against a row that was never overridden to begin with.
    await expect(row.getByText('Override', { exact: true })).toBeVisible();

    // Set back to the value the plan gives (on). A reason is still required — GymFeaturesList asks
    // for one on every value change unconditionally, because the console cannot tell in advance
    // whether a change will create an exception or collapse one away (gym-features-tab.tsx's own
    // comment on why `billing.read`-gated plan data isn't available to check first).
    await page.getByRole('switch', { name: PLAN_FEATURE.name }).setChecked(true);
    await page.getByLabel(`Reason for ${PLAN_FEATURE.name}`).fill(WITHDRAW_REASON);
    await clickSave(page);

    // The outcome is read back from the response, not predicted — this is the whole point of the
    // task: an override is only ever stored while it differs from the plan, so matching the plan's
    // value again must make the API's own resolution report it gone, not merely accept the write.
    await expect(visibleText(page, `${PLAN_FEATURE.name} is now on (Plan)`)).toBeVisible();

    await expect(row.getByText('Plan', { exact: true })).toBeVisible();
    await expect(row.getByText('Override', { exact: true })).toHaveCount(0);
    await expect(row.getByText(/^Reason:/)).toHaveCount(0);
    await expect(row.getByText(/Granted \d+ days? ago/)).toHaveCount(0);
  });

  test("on the plan, Excluded and Default both persist after a reload", async ({
    page,
    isMobile,
  }) => {
    await signIn(page);
    await page.goto(`/plans/${plan.id}`);
    await page.getByRole('tab', { name: 'Features' }).click();

    // EXCLUDED_FEATURE has never been touched (still `default`); DEFAULT_FEATURE was set Included in
    // the setup test above, so setting it back to Default here proves an explicit opinion can be
    // withdrawn back to "no opinion", not only that "no opinion" can be left alone.
    await featureRow(page, EXCLUDED_FEATURE.key).getByRole('button', { name: 'Excluded' }).click();
    await featureRow(page, DEFAULT_FEATURE.key).getByRole('button', { name: 'Default' }).click();
    await clickSave(page);

    await expect(
      featureRow(page, EXCLUDED_FEATURE.key).getByRole('button', { name: 'Excluded' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      featureRow(page, DEFAULT_FEATURE.key).getByRole('button', { name: 'Default' }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await page.getByRole('tab', { name: 'Features' }).click();

    await expect(
      featureRow(page, EXCLUDED_FEATURE.key).getByRole('button', { name: 'Excluded' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      featureRow(page, DEFAULT_FEATURE.key).getByRole('button', { name: 'Default' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
