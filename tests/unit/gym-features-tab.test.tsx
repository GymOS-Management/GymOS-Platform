import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GymFeaturesList } from '@/features/feature-flags/gym-features-tab';
import type { ResolvedFeatureDetail } from '@/types/api';

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
