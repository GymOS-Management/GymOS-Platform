import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceBadge } from '@/features/feature-flags/source-badge';
import { FeatureGroupList } from '@/features/feature-flags/feature-group-list';

describe('SourceBadge', () => {
  it.each([
    ['Override', 'Override'],
    ['Plan', 'Plan'],
    ['Default', 'Default'],
  ])('names the layer that decided the answer: %s', (source, expected) => {
    render(<SourceBadge source={source} />);

    expect(screen.getByText(expected)).toBeVisible();
  });

  it('renders an unrecognised source rather than dropping it', () => {
    // A fourth layer would be a backend change; showing the raw value beats showing nothing.
    render(<SourceBadge source="Something" />);

    expect(screen.getByText('Something')).toBeVisible();
  });
});

interface TestFeature {
  id: string;
  name: string;
  category: string;
}

describe('FeatureGroupList', () => {
  const items: TestFeature[] = [
    { id: '1', name: 'Rota planner', category: 'Operations' },
    { id: '2', name: 'Member portal', category: 'Members' },
    { id: '3', name: 'Churn forecasting', category: 'Insights' },
    { id: '4', name: 'Shift swaps', category: 'Operations' },
    { id: '5', name: 'Member self check-in', category: 'Members' },
  ];

  it('renders one section per distinct category, labelled with the category name', () => {
    render(
      <FeatureGroupList items={items} categoryOf={(item) => item.category}>
        {(item) => <span key={item.id}>{item.name}</span>}
      </FeatureGroupList>,
    );

    const regions = screen.getAllByRole('region');
    expect(regions).toHaveLength(3);
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual(
      expect.arrayContaining(['Operations', 'Members', 'Insights']),
    );
  });

  it('orders sections by first-seen order, not alphabetically', () => {
    // Categories occur in the input as Operations, Members, Insights — alphabetical order would be
    // Insights, Members, Operations, which is a different sequence and would fail this assertion.
    render(
      <FeatureGroupList items={items} categoryOf={(item) => item.category}>
        {(item) => <span key={item.id}>{item.name}</span>}
      </FeatureGroupList>,
    );

    const regions = screen.getAllByRole('region');
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Operations',
      'Members',
      'Insights',
    ]);
  });

  it("renders each item inside its own category's section via the children render prop", () => {
    render(
      <FeatureGroupList items={items} categoryOf={(item) => item.category}>
        {(item) => <span key={item.id}>{item.name}</span>}
      </FeatureGroupList>,
    );

    const regions = screen.getAllByRole('region');
    const operations = regions.find((region) => region.getAttribute('aria-label') === 'Operations');
    const members = regions.find((region) => region.getAttribute('aria-label') === 'Members');
    if (!operations || !members) {
      throw new Error('Expected both Operations and Members sections to render');
    }

    expect(within(operations).getByText('Rota planner')).toBeVisible();
    expect(within(operations).getByText('Shift swaps')).toBeVisible();
    expect(within(operations).queryByText('Member portal')).not.toBeInTheDocument();

    expect(within(members).getByText('Member portal')).toBeVisible();
    expect(within(members).getByText('Member self check-in')).toBeVisible();
    expect(within(members).queryByText('Rota planner')).not.toBeInTheDocument();
  });

  it('renders no sections and does not crash for an empty input array', () => {
    render(
      <FeatureGroupList items={[] as TestFeature[]} categoryOf={(item) => item.category}>
        {(item) => <span key={item.id}>{item.name}</span>}
      </FeatureGroupList>,
    );

    expect(screen.queryAllByRole('region')).toHaveLength(0);
  });
});
