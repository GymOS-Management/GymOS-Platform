import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubscriptionActions } from '@/features/subscriptions/subscription-actions';

const base = {
  id: 's1',
  gymId: 'g1',
  planId: 'p1',
  planCode: 'PRO',
  planName: 'Professional',
  status: 'Active',
  billingCycle: 'Monthly',
  billingCycleMonths: 1,
  amount: 49.99,
  currency: 'EUR',
  autoRenew: true,
  cancelAtPeriodEnd: false,
  canceledAtUtc: null,
  cancellationReason: null,
  trialEndsAtUtc: null,
  currentPeriodStartUtc: '2026-08-01T00:00:00Z',
  currentPeriodEndUtc: '2026-09-01T00:00:00Z',
  createdAtUtc: '2026-08-01T00:00:00Z',
  pendingChange: null,
  rowVersion: 'row-1',
};

function renderActions(overrides: Partial<typeof base> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubscriptionActions
        gymId="g1"
        subscription={{ ...base, ...overrides }}
        canManage
        onChanged={() => {}}
      />
    </QueryClientProvider>,
  );
}

/**
 * D7: a scheduled cancellation leaves the subscription Active — offering "Cancel subscription" again
 * would invite cancelling a cancellation, and the actual undo (Resume) lives on `SubscriptionCard`, not
 * here. A regression that re-enabled Cancel on top of a pending cancellation would make it possible to
 * open the cancel dialog against a subscription that is already winding down.
 */
describe('SubscriptionActions — cancel visibility', () => {
  it('does not offer Cancel once cancelAtPeriodEnd is true', () => {
    renderActions({ cancelAtPeriodEnd: true });

    expect(screen.queryByRole('button', { name: 'Cancel subscription' })).not.toBeInTheDocument();
  });

  it('offers Cancel for an Active subscription with no cancellation scheduled', () => {
    renderActions({ cancelAtPeriodEnd: false });

    expect(screen.getByRole('button', { name: 'Cancel subscription' })).toBeInTheDocument();
  });
});

/**
 * The manual past-due toggle stands in for what an automatic payment outcome would set. Offering
 * "Mark past due" on a `Trialing`/`Canceled`/`Expired` subscription — states that were never collecting
 * a period payment the normal way — would let an operator put a subscription into a state the domain
 * doesn't expect it to reach from there.
 */
describe('SubscriptionActions — past-due controls', () => {
  it('offers "Mark past due" for an Active subscription', () => {
    renderActions({ status: 'Active' });

    expect(screen.getByRole('button', { name: 'Mark past due' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear past due' })).not.toBeInTheDocument();
  });

  it('offers "Clear past due" for a PastDue subscription', () => {
    renderActions({ status: 'PastDue' });

    expect(screen.getByRole('button', { name: 'Clear past due' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark past due' })).not.toBeInTheDocument();
  });

  it.each(['Canceled', 'Expired', 'Trialing'])(
    'offers neither past-due control for a %s subscription',
    (status) => {
      renderActions({ status });

      expect(screen.queryByRole('button', { name: 'Mark past due' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear past due' })).not.toBeInTheDocument();
    },
  );
});
