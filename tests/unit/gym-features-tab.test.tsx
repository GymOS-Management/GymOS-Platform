import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GymFeaturesList, GymFeaturesTab } from '@/features/feature-flags/gym-features-tab';
import { gyms } from '@/lib/api/endpoints';
import type { ResolvedFeatureDetail } from '@/types/api';

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    gyms: { ...actual.gyms, features: vi.fn(), setFeatures: vi.fn() },
  };
});

const featuresMock = gyms.features as ReturnType<typeof vi.fn>;
const setFeaturesMock = gyms.setFeatures as ReturnType<typeof vi.fn>;

const NOW = new Date('2026-08-13T12:00:00Z');

function resolved(overrides: Partial<ResolvedFeatureDetail> = {}): ResolvedFeatureDetail {
  return {
    featureId: 'f1',
    key: 'crm',
    name: 'CRM',
    category: 'Members',
    enabled: false,
    source: 'Default',
    isPremium: true,
    overrideReason: null,
    overrideSetAtUtc: null,
    overrideSetByEmail: null,
    ...overrides,
  } as ResolvedFeatureDetail;
}

const overridden = resolved({
  enabled: true,
  source: 'Override',
  overrideReason: '90-day goodwill trial',
  overrideSetAtUtc: '2026-08-01T12:00:00Z',
  overrideSetByEmail: 'ops@gymos.test',
});

describe('a gym’s resolved features', () => {
  it('shows the whole catalogue, not only the exceptions', () => {
    // The support question is "is POS on, and why?", which a list of exceptions cannot answer.
    render(
      <GymFeaturesList
        features={[
          resolved({ featureId: 'f1', key: 'crm', name: 'CRM' }),
          resolved({ featureId: 'f2', key: 'pos', name: 'POS', source: 'Plan', enabled: true }),
          resolved({ featureId: 'f3', key: 'gateway', name: 'Gateway', category: 'Integrations' }),
        ]}
        canManage={false}
        now={NOW}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('CRM')).toBeVisible();
    expect(screen.getByText('POS')).toBeVisible();
    expect(screen.getByText('Gateway')).toBeVisible();
  });

  it('names the layer that decided each answer', () => {
    render(
      <GymFeaturesList
        features={[resolved({ source: 'Plan', enabled: true })]}
        canManage={false}
        now={NOW}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText('Plan')).toBeVisible();
  });

  it('shows an override’s reason, author, age, and that it does not expire', () => {
    render(
      <GymFeaturesList features={[overridden]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText(/90-day goodwill trial/)).toBeVisible();
    expect(screen.getByText(/ops@gymos\.test/)).toBeVisible();
    expect(screen.getByText(/12 days ago/)).toBeVisible();
    expect(screen.getByText(/does not expire/i)).toBeVisible();
  });

  it('asks for a review once a grant is older than the threshold', () => {
    const old = { ...overridden, overrideSetAtUtc: '2026-05-11T12:00:00Z' }; // 94 days

    render(<GymFeaturesList features={[old]} canManage={false} now={NOW} onSubmit={vi.fn()} />);

    expect(screen.getByText(/review/i)).toBeVisible();
  });

  it('renders an override whose author was deleted as (unknown)', () => {
    // SetByUserId is cleared, not the override: the exception survives losing its author.
    const orphaned = { ...overridden, overrideSetByEmail: null };

    render(
      <GymFeaturesList features={[orphaned]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.getByText(/\(unknown\)/)).toBeVisible();
    expect(screen.getByText(/90-day goodwill trial/)).toBeVisible();
  });

  it('refuses to submit a value change with no reason', async () => {
    // Required on every change, because the console cannot tell in advance whether a change
    // creates an exception or withdraws one — that needs the plan's opinion, behind billing.read.
    const onSubmit = vi.fn();
    render(<GymFeaturesList features={[resolved()]} canManage now={NOW} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('switch', { name: /crm/i }));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/reason is required/i)).toBeVisible();
  });

  it('sends only the keys that changed, each with its reason', async () => {
    const onSubmit = vi.fn();
    render(
      <GymFeaturesList
        features={[
          resolved({ featureId: 'f1', key: 'crm', name: 'CRM' }),
          resolved({ featureId: 'f2', key: 'pos', name: 'POS', enabled: true, source: 'Plan' }),
        ]}
        canManage
        now={NOW}
        onSubmit={onSubmit}
      />,
    );

    await userEvent.click(screen.getByRole('switch', { name: /crm/i }));
    await userEvent.type(screen.getByLabelText(/reason for crm/i), 'pilot for Q3');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { key: 'crm', isEnabled: true, reason: 'pilot for Q3' },
    ]);
  });

  it('offers no controls without features.manage', () => {
    render(
      <GymFeaturesList features={[resolved()]} canManage={false} now={NOW} onSubmit={vi.fn()} />,
    );

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });
});

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GymFeaturesTab gymId="g1" canManage />
    </QueryClientProvider>,
  );
}

/**
 * D6 (F4-DESIGN §6): the console cannot tell in advance whether turning CRM on will create an
 * override or collapse into the plan's own answer — that needs the plan's opinion, behind
 * `billing.read`. The row must show whatever `PUT /gyms/{id}/features` actually reports, never a
 * guess based on what was requested.
 */
describe('GymFeaturesTab — container', () => {
  it('shows the source the response reports, not the one a naive prediction would assume', async () => {
    featuresMock.mockResolvedValue([
      resolved({ featureId: 'f1', key: 'crm', name: 'CRM', enabled: false, source: 'Default' }),
    ]);
    // Asking to turn CRM on would naively read as creating an Override — but the response says the
    // plan already includes it, so resolution collapses to the plan's own answer instead.
    setFeaturesMock.mockResolvedValue([
      resolved({ featureId: 'f1', key: 'crm', name: 'CRM', enabled: true, source: 'Plan' }),
    ]);

    const user = userEvent.setup();
    renderTab();

    await screen.findByText('CRM');
    await user.click(screen.getByRole('switch', { name: /crm/i }));
    await user.type(screen.getByLabelText(/reason for crm/i), 'pilot for Q3');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Plan')).toBeVisible();
    expect(screen.queryByText('Override')).not.toBeInTheDocument();
  });
});

describe('correcting an override’s reason', () => {
  it('seeds the reason box with the override’s existing reason, so it can be edited', () => {
    // Blank-seeding made the stored reason invisible in the field that edits it: an operator
    // correcting "temp" had to retype the whole justification from what the row displayed above.
    render(<GymFeaturesList features={[overridden]} canManage now={NOW} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/reason for crm/i)).toHaveValue('90-day goodwill trial');
  });

  it('submits a reason-only correction, with the value left alone', async () => {
    // The backend supports exactly this write — it upserts an existing override with a new reason
    // while the value still differs from the plan's. Filtering submissions on value change alone
    // made a supported, audit-relevant edit unreachable, and silently: no request, no message.
    const onSubmit = vi.fn();
    render(<GymFeaturesList features={[overridden]} canManage now={NOW} onSubmit={onSubmit} />);

    const reason = screen.getByLabelText(/reason for crm/i);
    await userEvent.clear(reason);
    await userEvent.type(reason, 'extended to year end, agreed with the owner');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith([
      { key: 'crm', isEnabled: true, reason: 'extended to year end, agreed with the owner' },
    ]);
  });

  it('refuses to blank an existing override’s reason', async () => {
    // An override with no reason is refused by the server, and an exception whose justification has
    // been erased is exactly what the audit trail exists to prevent.
    const onSubmit = vi.fn();
    render(<GymFeaturesList features={[overridden]} canManage now={NOW} onSubmit={onSubmit} />);

    await userEvent.clear(screen.getByLabelText(/reason for crm/i));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/reason is required/i)).toBeVisible();
  });

  it('does not resubmit an override whose reason is merely reformatted', async () => {
    // Trailing whitespace is not an edit. Sending it would rewrite the override's author and
    // timestamp for no change, which is a lie in the audit trail.
    const onSubmit = vi.fn();
    render(<GymFeaturesList features={[overridden]} canManage now={NOW} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/reason for crm/i), '   ');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('freezes the editing controls while a save is in flight', async () => {
    // Only Save was gated on `busy`; the switch and the reason box stayed live, so anything typed
    // during the request was wiped when the response re-seeded the draft — the same failure class
    // already fixed on the plan card, left standing on this one.
    render(<GymFeaturesList features={[overridden]} canManage now={NOW} busy onSubmit={vi.fn()} />);

    expect(screen.getByRole('switch', { name: /crm/i })).toBeDisabled();
    expect(screen.getByLabelText(/reason for crm/i)).toBeDisabled();
  });
});
