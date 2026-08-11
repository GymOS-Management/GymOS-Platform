import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PriceEditor } from '@/features/plans/price-editor';

const prices = [
  { id: 'p1', billingCycle: 'Monthly', amount: 49.99, currency: 'EUR' },
  { id: 'p2', billingCycle: 'Yearly', amount: 499, currency: 'EUR' },
];

describe('PriceEditor', () => {
  it('formats each amount in its own currency', () => {
    render(<PriceEditor planId="plan-1" rowVersion="row-1" prices={prices} canManage={true} />);

    expect(screen.getByText(/49\.99/)).toBeInTheDocument();
    expect(screen.getByText(/499/)).toBeInTheDocument();
  });

  it('offers no mutating control without billing.manage', () => {
    render(<PriceEditor planId="plan-1" rowVersion="row-1" prices={prices} canManage={false} />);

    expect(screen.queryByRole('button', { name: /add price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
