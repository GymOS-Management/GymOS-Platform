import { expect, test, type Page } from '@playwright/test';

/**
 * The F2 definition-of-done journey, end to end and unmocked:
 * sign in → create a plan → price it → open a gym → assign the plan → see the issued invoice on the
 * gym's own Invoices tab → find the same invoice from the cross-gym /invoices list → mark it paid → see
 * the status become Paid.
 *
 * Runs twice via playwright.config.ts: Desktop Chrome and iPhone 13. The mobile pass is the
 * responsiveness gate, same as operator-journey.spec.ts — every step must be completable at 375px.
 *
 * Jobs are disabled on the backend for this run (Jobs:Enabled=false — see tests/e2e/README.md). That
 * matters here specifically: the renewal sweep (15 min) and the overdue sweep (hourly) both touch the
 * exact rows this journey asserts on, and a sweep firing mid-run could relabel a subscription or an
 * invoice out from under an assertion. The invoice this journey issues has a due date well in the
 * future, so it should never read as overdue regardless — the sweep is disabled as a second line of
 * defence, not the only one.
 */

const SUPER_ADMIN = { email: 'e2e@gymos.test', password: 'e2e-super-admin-password' };

/**
 * Text as the operator actually sees it. Copied from operator-journey.spec.ts rather than imported:
 * each spec file is self-contained, matching how Playwright discovers and runs them independently.
 *
 * DataTable renders both a desktop table and mobile cards, hiding one with CSS — so every row's text
 * exists twice in the DOM and a bare getByText matches an element nobody can click. Filtering to the
 * visible one is what makes these assertions mean "the operator can see this at this viewport".
 */
function visibleText(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true });
}

/**
 * Unique per run AND per project, same reasoning as operator-journey.spec.ts's `gym`: plans cannot be
 * deleted (D6) and gym slugs are never released, so the database only grows. A fixed code or slug
 * collides on the second run; a per-project one also stops the desktop and mobile passes (which each
 * provision their own plan and gym) from colliding with each other in the same run.
 */
const runId = `${Date.now()}`.slice(-8);
const plan = { code: '', name: '', id: '' };
const gym = { slug: '', name: '' };
const invoice = { number: '', id: '' };

/** `{year}-{sequence:D6}`, e.g. `2026-000001` (InvoiceNumberGenerator.cs) — no "INV-" prefix. */
const INVOICE_NUMBER = /^\d{4}-\d{6}$/;

/**
 * A GUID path segment, deliberately not just `[^/]+$`. `/plans/new` also satisfies `[^/]+$`, so a
 * looser regex is already true the instant the create form loads — `toHaveURL` would resolve before
 * the create-and-redirect ever happens, and the id captured off `page.url()` right after would be the
 * literal string "new". Anchoring on the id's actual shape makes the assertion wait for the real
 * navigation instead of a coincidental match on the page it started from.
 */
const GUID_PATH_SEGMENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test.beforeAll(() => {
  const project = test.info().project.name;
  // Upper-case letters, digits and underscores only — the plan code's own validation (plan-form.tsx).
  plan.code = `E2E_${project.toUpperCase()}_${runId}`;
  plan.name = `E2E Plan ${project} ${runId}`;
  gym.slug = `e2e-billing-${project}-${runId}`;
  gym.name = `E2E Billing ${project} ${runId}`;
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPER_ADMIN.email);
  await page.getByLabel('Password', { exact: true }).fill(SUPER_ADMIN.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // F3 moved the landing route to /dashboard for anyone holding `analytics.read` or `audit.read`
  // (F3-DESIGN D6); a SuperAdmin holds both. This journey's own screens are reached by navigation
  // below, so it only needs to know that sign-in completed.
  // 30s rather than the 5s default: the dev server compiles /dashboard on the first request of a
  // run, and a timeout here would read as a broken redirect rather than a cold cache.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/** Finds the run's gym from the list, through whichever nav the viewport offers. */
async function openGym(page: Page) {
  await page.goto('/gyms');
  await page.getByLabel('Search gyms').fill(gym.slug);
  await visibleText(page, gym.name).first().click();
  await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible();
}

test.describe.serial('billing journey', () => {
  test('creates a plan with a unique code, starting active and public', async ({ page }) => {
    await signIn(page);

    // Direct navigation, same as operator-journey.spec.ts's `/gyms/new` case — /plans has both a
    // header "New plan" link and (with zero plans platform-wide the first time this suite runs) an
    // empty-state one too, so going straight to /plans/new sidesteps that ambiguity entirely.
    await page.goto('/plans/new');
    await page.getByLabel('Code').fill(plan.code);
    await page.getByLabel('Name').fill(plan.name);
    // Trial days, sort order and the four capacity limits are left at their defaults (0 / blank —
    // blank means unlimited, plan-form.tsx) — this journey only needs a plan that can be priced and
    // assigned, not a fully negotiated one.
    await page.getByRole('button', { name: 'Create plan' }).click();

    // Creating redirects to /plans/{id} — capture it so later steps can navigate straight there
    // without re-searching the list, the same way operator-journey.spec.ts's gym tests share `gym`.
    await expect(page).toHaveURL(new RegExp(`/plans/${GUID_PATH_SEGMENT.source}`, 'i'));
    plan.id = page.url().split('/').pop()!;

    const heading = page.getByRole('heading', { name: new RegExp(plan.name) });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Active');
  });

  test('adds a monthly EUR price to the plan', async ({ page }) => {
    await signIn(page);
    await page.goto(`/plans/${plan.id}`);

    await page.getByRole('tab', { name: 'Prices' }).click();
    await page.getByRole('button', { name: 'Add price' }).click();

    // Billing cycle defaults to Monthly (the first of price-editor.tsx's BILLING_CYCLES) and currency
    // defaults to EUR — both already what this journey needs, so only the amount is filled.
    await page.getByLabel('Amount').fill('49.99');
    await page.getByRole('button', { name: 'Save price' }).click();

    await expect(page.getByText('Price saved.')).toBeVisible();

    // PriceEditor's list is a DataTable: a desktop <table> and a mobile card list both exist in the
    // DOM, one hidden by CSS per viewport (data-table.tsx) — so this uses `visibleText`, exactly as
    // tests/e2e/README.md instructs, rather than a bare getByText that would match the hidden copy too.
    await expect(visibleText(page, 'Monthly').first()).toBeVisible();
    await expect(visibleText(page, 'EUR').first()).toBeVisible();
    // D2: money is formatted from amount + currency (Intl.NumberFormat), never a fixed toFixed(2) —
    // matched loosely on the digits so this doesn't depend on the runner's currency-symbol placement.
    await expect(visibleText(page, /49\.99/).first()).toBeVisible();
  });

  test('provisions the gym that will be billed', async ({ page }) => {
    await signIn(page);
    // Sign-in lands on /dashboard since F3 (D6); the provision link lives on the gyms list.
    await page.goto('/gyms');

    await page
      .getByRole('link', { name: /provision gym/i })
      .first()
      .click();
    await page.getByLabel(/address \(slug\)/i).fill(gym.slug);
    await page.getByLabel('Gym name').fill(gym.name);
    await page.getByLabel('Owner name').fill('E2E Billing Owner');
    await page.getByLabel('Owner email').fill('billing-owner@e2e.test');
    await page.getByRole('button', { name: 'Provision gym' }).click();

    await expect(page.getByRole('heading', { name: new RegExp(gym.name) })).toBeVisible();
  });

  test('assigns the plan to the gym, and the subscription starts active', async ({ page }) => {
    await signIn(page);
    await openGym(page);

    await page.getByRole('tab', { name: 'Subscription' }).click();
    // No subscription yet: the tab shows an EmptyState whose action is this same AssignPlanDialog,
    // offering "Assign plan" rather than "Change plan" (assign-dialog.tsx).
    await page.getByRole('button', { name: 'Assign plan' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Plan').click();
    await page.getByRole('option', { name: new RegExp(plan.name) }).click();
    // Billing cycle and currency are derived from the selected plan's own prices (assign-dialog.tsx's
    // `effectiveCycle`/`effectiveCurrency`) and land on Monthly/EUR without a further click, since that
    // is the only price this plan has.
    await dialog.getByRole('button', { name: 'Assign plan' }).click();

    await expect(page.getByText('Plan assigned.')).toBeVisible();

    // SubscriptionCard (subscription-card.tsx) is a plain <dl>, not a DataTable, so its facts render
    // once regardless of viewport — no `visibleText` needed for these two.
    const subscriptionHeading = page.getByRole('heading', { name: new RegExp(plan.name) });
    await expect(subscriptionHeading).toBeVisible();
    await expect(subscriptionHeading).toContainText('Active');
    await expect(page.getByText(/49\.99/).first()).toBeVisible();
    await expect(page.getByText(/Monthly/).first()).toBeVisible();
  });

  test("the assignment issues an invoice, visible on the gym's Invoices tab", async ({ page }) => {
    await signIn(page);
    await openGym(page);

    await page.getByRole('tab', { name: 'Invoices' }).click();

    // InvoiceTable is a DataTable too, so every one of these must go through `visibleText` — a bare
    // getByText would happily resolve to the hidden desktop-or-mobile copy and either double-match or
    // silently assert against an element the operator at this viewport cannot see.
    // D3: the server's own status, not a client guess — a brand-new invoice reads as Issued.
    await expect(visibleText(page, 'Issued').first()).toBeVisible();
    await expect(visibleText(page, /49\.99/).first()).toBeVisible();

    // Capture the invoice number so the next test can find the same invoice from the cross-gym list —
    // proving the two screens (gym-scoped and platform-wide) agree on one record, not two.
    const numberLocator = visibleText(page, INVOICE_NUMBER).first();
    await expect(numberLocator).toBeVisible();
    invoice.number = ((await numberLocator.textContent()) ?? '').trim();
    expect(invoice.number).toMatch(INVOICE_NUMBER);
  });

  test('the same invoice is findable from the cross-gym /invoices list', async ({ page }) => {
    await signIn(page);

    await page.goto('/invoices');
    await page.getByLabel('Search invoices').fill(invoice.number);

    // `search` matches the invoice number server-side (InvoiceEndpoints.cs), so this narrows to
    // exactly the one row regardless of how many invoices other runs have left behind.
    await visibleText(page, invoice.number).first().click();

    // Same GUID anchor as the plan-id capture above, for the same reason: `[^/]+$` would also match
    // a static route this app doesn't currently have (there's no `/invoices/new`), but that's a fact
    // about today's routing, not about this regex — anchoring on the id's actual shape makes the
    // assertion correct regardless of what routes get added later.
    await expect(page).toHaveURL(new RegExp(`/invoices/${GUID_PATH_SEGMENT.source}`, 'i'));
    invoice.id = page.url().split('/').pop()!;

    const heading = page.getByRole('heading', { name: new RegExp(invoice.number) });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Issued');
    // The invoice detail page names the gym it belongs to (invoice-detail.tsx's description line),
    // tying this back to the gym provisioned above.
    await expect(page.getByRole('link', { name: gym.name })).toBeVisible();
  });

  test('marking the invoice paid settles it, and the status becomes Paid', async ({ page }) => {
    await signIn(page);
    await page.goto(`/invoices/${invoice.id}`);

    await page.getByRole('button', { name: 'Mark paid' }).click();

    const dialog = page.getByRole('dialog');
    // D5b: the payment reference is optional but offered — filled here to also prove it round-trips
    // onto the invoice once paid, not just that the button works.
    await dialog.getByLabel('Payment reference').fill(`E2E-${runId}`);
    await dialog.getByRole('button', { name: 'Mark paid' }).click();

    await expect(page.getByText('Invoice marked paid.')).toBeVisible();

    const heading = page.getByRole('heading', { name: new RegExp(invoice.number) });
    await expect(heading).toContainText('Paid');
    await expect(heading).not.toContainText('Issued');
    await expect(page.getByText(`E2E-${runId}`)).toBeVisible();

    // A closed invoice offers neither action, regardless of permission (invoice-detail.tsx's `isOpen`).
    await expect(page.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Void' })).toHaveCount(0);
  });
});
