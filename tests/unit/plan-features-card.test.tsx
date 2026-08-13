import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  PlanFeaturesCard,
  PlanFeaturesList,
  type PlanFeatureRow,
} from '@/features/feature-flags/plan-features-card';
import { features, plans } from '@/lib/api/endpoints';

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    features: { ...actual.features, list: vi.fn() },
    plans: { ...actual.plans, features: vi.fn(), setFeatures: vi.fn() },
  };
});

const listMock = features.list as ReturnType<typeof vi.fn>;
const planFeaturesMock = plans.features as ReturnType<typeof vi.fn>;
const setFeaturesMock = plans.setFeatures as ReturnType<typeof vi.fn>;

const rows: PlanFeatureRow[] = [
  { key: 'crm', name: 'CRM', category: 'Members', state: 'default', defaultEnabled: false },
  { key: 'pos', name: 'POS', category: 'Operations', state: 'included', defaultEnabled: true },
];

describe('what a plan includes', () => {
  it('offers three states and marks the current one', () => {
    render(<PlanFeaturesList rows={rows} canManage onSubmit={vi.fn()} />);

    expect(screen.getAllByRole('button', { name: 'Included' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Excluded' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Default' })).toHaveLength(2);

    // CRM is on Default; POS is Included.
    expect(screen.getAllByRole('button', { name: 'Default' })[0]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getAllByRole('button', { name: 'Included' })[1]).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows what Default resolves to today, so silence shows its consequence', () => {
    render(<PlanFeaturesList rows={rows} canManage onSubmit={vi.fn()} />);

    expect(screen.getByText(/default today: off/i)).toBeVisible();
    expect(screen.getByText(/default today: on/i)).toBeVisible();
  });

  it('sends null for Default — clearing an opinion, not excluding', async () => {
    // `false` and absent look identical to a gym today and answer differently the moment the
    // platform default moves. Sending false here would silently freeze the plan against a future
    // default change.
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Default' })[1]!); // POS -> Default
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'pos', isEnabled: null }]);
  });

  it('sends false for Excluded', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Excluded' })[0]!); // CRM
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'crm', isEnabled: false }]);
  });

  it('sends only the keys that changed', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Included' })[0]!); // CRM only
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([{ key: 'crm', isEnabled: true }]);
  });

  it('does not submit at all when nothing changed — the API refuses an empty list', async () => {
    const onSubmit = vi.fn();
    render(<PlanFeaturesList rows={rows} canManage onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('is read-only without billing.manage', () => {
    render(<PlanFeaturesList rows={rows} canManage={false} onSubmit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Included' })[0]).toBeDisabled();
  });
});

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PlanFeaturesCard planId="p1" rowVersion="row-1" canManage />
    </QueryClientProvider>,
  );
}

/**
 * The live data-loss bug (whole-branch review, CRITICAL): `PlanFeaturesCard` rebuilt `rows` as a
 * fresh array literal on every render. `useMutation` has no property tracking, so `save.mutate()`
 * setting `isPending` re-rendered the container, which made the freshly-built `rows` fail
 * `PlanFeaturesList`'s `rows !== prevRows` identity check and fire the render-time reset back to the
 * pre-save server state — discarding the operator's draft while the request was still in flight, and
 * permanently if the PUT then failed.
 */
describe('PlanFeaturesCard — the draft survives a pending save', () => {
  it('keeps the operator’s chosen state selected while Save is in flight', async () => {
    listMock.mockResolvedValue([
      { key: 'crm', name: 'CRM', category: 'Members', defaultEnabled: false },
    ]);
    planFeaturesMock.mockResolvedValue({ features: [] });
    // A promise that never resolves during this test — `save.isPending` stays true, exactly the
    // window the bug reset the draft in.
    setFeaturesMock.mockReturnValue(new Promise(() => {}));

    const user = userEvent.setup();
    renderCard();

    await screen.findByText('CRM');
    await user.click(screen.getByRole('button', { name: 'Excluded' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    // The PUT is still pending (it never resolves in this test). The operator's choice must still
    // read as selected — not reset back to CRM's pre-save "Default" state.
    expect(await screen.findByRole('button', { name: 'Excluded' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
