import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/data/status-badge';

/**
 * Asserting on text alone would pass even if every billing status fell through to the neutral
 * tone — the label still renders either way. These assertions check the rendered class for the
 * tone `Badge` actually emits for each status, so a status mapped to the wrong colour (or dropped
 * from the map entirely, landing on neutral's `bg-secondary`) fails the test.
 */
describe('StatusBadge — billing statuses', () => {
  it.each([
    ['Trialing', 'bg-sky-100'], // info
    ['PastDue', 'bg-amber-100'], // warning
    ['Canceled', 'bg-secondary'], // neutral
    ['Expired', 'bg-secondary'], // neutral
    ['Issued', 'bg-sky-100'], // info
    ['Paid', 'bg-emerald-100'], // success
    ['Overdue', 'bg-red-100'], // danger
    ['Void', 'bg-secondary'], // neutral
  ])('renders %s with its mapped tone', (status, toneClass) => {
    render(<StatusBadge status={status} />);
    const el = screen.getByText(status);
    expect(el).toBeInTheDocument();
    expect(el.className).toContain(toneClass);
  });

  it('renders an unknown status rather than crashing, falling back to neutral', () => {
    render(<StatusBadge status="SomethingNew" />);
    const el = screen.getByText('SomethingNew');
    expect(el).toBeInTheDocument();
    expect(el.className).toContain('bg-secondary');
  });
});
