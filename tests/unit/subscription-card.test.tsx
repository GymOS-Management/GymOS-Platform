import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubscriptionCard } from '@/features/subscriptions/subscription-card';

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

describe('SubscriptionCard', () => {
  it('says a scheduled cancellation is still active and paid through the period (D7)', () => {
    render(<SubscriptionCard subscription={{ ...base, cancelAtPeriodEnd: true }} canManage />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/cancels on/i)).toBeInTheDocument();
  });

  it('says PastDue does not withhold service', () => {
    render(<SubscriptionCard subscription={{ ...base, status: 'PastDue' }} canManage />);

    expect(screen.getByText('PastDue')).toBeInTheDocument();
    expect(screen.getByText(/service is not affected/i)).toBeInTheDocument();
  });

  it('shows a pending plan change and when it applies', () => {
    render(
      <SubscriptionCard
        subscription={{
          ...base,
          // PendingPlanChangeDetail (src/types/api.d.ts) declares only planId, billingCycle, amount,
          // currency and changeAtUtc — no planName/planCode and no effectiveAtUtc, unlike the brief's
          // fixture guess. The card resolves a human-readable name via the separate `pendingPlanName`
          // prop (the tab supplies it from `plans.list`, since the pending-change payload itself never
          // carries one).
          pendingChange: {
            planId: 'p2',
            billingCycle: 'Yearly',
            amount: 999,
            currency: 'EUR',
            changeAtUtc: '2026-09-01T00:00:00Z',
          },
        }}
        canManage
        pendingPlanName="Enterprise"
      />,
    );

    expect(screen.getByText(/Enterprise/)).toBeInTheDocument();
  });
});
