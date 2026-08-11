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
    //
    // The regexes require the € symbol next to the digits, not just the digits: `formatMoney` derives
    // the symbol and decimal count from the currency code via `Intl.NumberFormat`, so requiring the
    // symbol is what a bare `toFixed(2)` or `String(amount)` — both currency-less — cannot satisfy.
    // `\s*` (rather than a literal space) tolerates `Intl.NumberFormat`'s locale-dependent placement,
    // including the non-breaking space (U+00A0) some locales use between symbol and amount.
    //
    // tests/setup.ts pins `Intl.NumberFormat(undefined, …)` to en-US for this process, so this doesn't
    // depend on the runner's OS locale (en-US: "€49.99", no gap) — see that file for why pinning is
    // needed and why env vars couldn't do it.
    const table = within(screen.getByRole('table'));
    expect(table.getByText(/€\s*49\.99/)).toBeInTheDocument();
    expect(table.getByText(/€\s*499\.00/)).toBeInTheDocument();
  });

  it('offers no mutating control without billing.manage', () => {
    render(<PriceEditor planId="plan-1" rowVersion="row-1" prices={prices} canManage={false} />);

    expect(screen.queryByRole('button', { name: /add price/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
