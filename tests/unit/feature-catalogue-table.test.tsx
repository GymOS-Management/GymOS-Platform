import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FeatureCatalogueTable } from '@/features/feature-flags/feature-catalogue-table';
import type { FeatureListItem } from '@/types/api';

function feature(overrides: Partial<FeatureListItem> = {}): FeatureListItem {
  return {
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
    ...overrides,
  } as FeatureListItem;
}

describe('the catalogue', () => {
  it('shows adoption and override counts', () => {
    render(<FeatureCatalogueTable items={[feature()]} canManage onEdit={vi.fn()} />);

    expect(screen.getByText('42')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
  });

  it('shows no count at all when the API returned null, never a zero', () => {
    // A write response returns these null. Rendering 0 would tell the operator "no gyms use this"
    // in the very moment after they edited it.
    render(
      <FeatureCatalogueTable
        items={[feature({ adoptionCount: null, overrideCount: null })]}
        canManage
        onEdit={vi.fn()}
      />,
    );

    expect(screen.queryByText('0')).toBeNull();
  });

  it('marks a feature no module declares any more, and refuses to edit it', () => {
    render(
      <FeatureCatalogueTable items={[feature({ isDeclared: false })]} canManage onEdit={vi.fn()} />,
    );

    expect(screen.getByText(/no module declares this key/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled();
  });

  it('offers no edit affordance without features.manage', () => {
    render(<FeatureCatalogueTable items={[feature()]} canManage={false} onEdit={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
  });
});
