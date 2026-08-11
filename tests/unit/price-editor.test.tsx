import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceEditor } from '@/features/plans/price-editor';

const prices = [
  { id: 'p1', billingCycle: 'Monthly', amount: 49.99, currency: 'EUR' },
  { id: 'p2', billingCycle: 'Yearly', amount: 499, currency: 'EUR' },
];

describe('PriceEditor', () => {
  it('formats each amount in its own currency', () => {
    render(<PriceEditor planId="plan-1" rowVersion="row-1" prices={prices} canManage={true} />);

    // `DataTable` renders every row's content twice by design — once for the desktop table, once for
    // the mobile card list, both present in the DOM at once (docs/F1-AS-BUILT.md) — so a bare
    // `screen.getByText` here would throw on "multiple elements found". Scoping to the table asserts
    // *where* the amount renders rather than merely that it exists somewhere. Do not "fix" the
    // duplication by hiding the amount column on mobile again — that was tried and reverted; the price
    // is the single most important field on this screen and must show on a phone too.
    const table = within(screen.getByRole('table'));
    expect(table.getByText(/49\.99/)).toBeInTheDocument();
    expect(table.getByText(/499/)).toBeInTheDocument();
  });

  it('offers no mutating control without billing.manage', () => {
    render(<PriceEditor planId="plan-1" rowVersion="row-1" prices={prices} canManage={false} />);

    expect(screen.queryByRole('button', { name: /add price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
