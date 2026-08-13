import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FeatureEditForm } from '@/features/feature-flags/feature-edit-form';
import type { FeatureListItem } from '@/types/api';

const crm = {
  id: 'f1',
  key: 'crm',
  name: 'CRM',
  description: 'Customer relationships',
  category: 'Members',
  defaultEnabled: false,
  isPremium: true,
  adoptionCount: 42,
  overrideCount: 3,
  rowVersion: 'v1',
  isDeclared: true,
} as FeatureListItem;

describe('editing a catalogue entry', () => {
  it('shows the key but never lets it be edited', () => {
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('crm')).toBeVisible();
    expect(screen.queryByLabelText(/key/i)).toBeNull();
  });

  it('saves a copy change without any confirmation', async () => {
    const onSubmit = vi.fn();
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Customer CRM');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Customer CRM' }));
  });

  it('confirms a default flip, and admits it cannot say how many gyms are affected', async () => {
    const onSubmit = vi.fn();
    render(
      <FeatureEditForm
        feature={crm}
        busy={false}
        error={null}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText(/enabled by default/i));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    // Not saved yet — the widest-blast-radius write in the module asks first.
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/re-answers CRM for every gym/i)).toBeVisible();
    expect(
      screen.getByText(/cannot tell you exactly how many gyms follow the default/i),
    ).toBeVisible();
    // The two counts it genuinely has.
    expect(screen.getByText(/42/)).toBeVisible();
    expect(screen.getByText(/3/)).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: /change default/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ defaultEnabled: true }));
  });
});
