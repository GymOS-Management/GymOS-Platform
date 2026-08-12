import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MrrPanel } from '@/features/dashboard/summary-panels';

/**
 * D2: MRR is reported **per currency and never summed**.
 *
 * `Analytics.md` §4 is explicit that this is permanent, not a placeholder: adding unlike currencies
 * needs an exchange-rate policy (AD-43) nobody has decided, and when AD-43 lands it adds a converted
 * total *alongside* the array rather than replacing it. So there must be no code path here that
 * produces a combined figure.
 */
describe('MrrPanel', () => {
  it('renders one figure per currency and never their sum', () => {
    render(
      <MrrPanel
        mrr={[
          { amount: 120.5, currency: 'EUR' },
          { amount: 80, currency: 'GBP' },
        ]}
      />,
    );

    expect(screen.getByText('€120.50')).toBeInTheDocument();
    expect(screen.getByText('£80.00')).toBeInTheDocument();

    // 200.50 is what a summed figure would read. Its absence in any currency is the assertion.
    expect(screen.queryByText(/200[.,]50/)).not.toBeInTheDocument();
    expect(screen.getByText(/never added together/i)).toBeInTheDocument();
  });

  it('formats each currency to its own minor units', () => {
    // JPY has no minor units and KWD has three. A `toFixed(2)` would misprint both — the reason
    // `formatMoney` derives precision from the code rather than assuming two decimals (F2 D2).
    render(
      <MrrPanel
        mrr={[
          { amount: 4000, currency: 'JPY' },
          { amount: 12.345, currency: 'KWD' },
        ]}
      />,
    );

    expect(screen.getByText('¥4,000')).toBeInTheDocument();
    expect(screen.getByText(/12\.345/)).toBeInTheDocument();
  });

  it('says there are no paying subscriptions rather than showing a zero', () => {
    // An empty array is a platform with nothing billing. Rendering "€0.00" would have to invent a
    // currency to render at all, and zero revenue is a different fact from no subscriptions.
    render(<MrrPanel mrr={[]} />);

    expect(screen.getByText(/no paying subscriptions/i)).toBeInTheDocument();
    expect(screen.queryByText(/0\.00/)).not.toBeInTheDocument();
  });

  it('omits the per-currency caveat when there is only one currency', () => {
    render(<MrrPanel mrr={[{ amount: 120.5, currency: 'EUR' }]} />);

    expect(screen.getByText('€120.50')).toBeInTheDocument();
    expect(screen.queryByText(/never added together/i)).not.toBeInTheDocument();
  });

  it('coerces a string amount from the generated contract', () => {
    render(<MrrPanel mrr={[{ amount: '99.95', currency: 'EUR' }]} />);

    expect(screen.getByText('€99.95')).toBeInTheDocument();
  });
});
