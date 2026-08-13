import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanFeaturesList, type PlanFeatureRow } from '@/features/feature-flags/plan-features-card';

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
