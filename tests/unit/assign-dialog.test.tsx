import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignPlanDialog } from '@/features/subscriptions/assign-dialog';
import { plans } from '@/lib/api/endpoints';

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    plans: {
      ...actual.plans,
      list: vi.fn(),
      get: vi.fn(),
    },
  };
});

const listMock = plans.list as ReturnType<typeof vi.fn>;
const getMock = plans.get as ReturnType<typeof vi.fn>;

const planListItem = {
  id: 'p1',
  code: 'PRO',
  name: 'Professional',
  isActive: true,
  isPublic: true,
  priceCount: 1,
  sortOrder: 1,
  subscribedGymCount: 0,
  trialDays: 0,
  createdAtUtc: '2026-01-01T00:00:00Z',
};

// This plan prices EUR only — the exact case the reviewer flagged: the currency picker must be scoped
// to what *this plan* actually prices, not a fixed global currency list.
const planDetailEurOnly = {
  id: 'p1',
  code: 'PRO',
  name: 'Professional',
  description: '',
  isActive: true,
  isPublic: true,
  maxMembers: null,
  maxStaff: null,
  maxTrainers: null,
  storageLimitMb: null,
  sortOrder: 1,
  subscribedGymCount: 0,
  trialDays: 0,
  createdAtUtc: '2026-01-01T00:00:00Z',
  rowVersion: 'row-1',
  prices: [
    {
      id: 'price-1',
      billingCycle: 'Monthly',
      billingCycleMonths: 1,
      currency: 'EUR',
      amount: 49.99,
    },
  ],
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignPlanDialog gymId="g1" subscription={null} canManage onAssigned={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('AssignPlanDialog', () => {
  beforeEach(() => {
    listMock.mockReset();
    getMock.mockReset();
    listMock.mockResolvedValue({ items: [planListItem], page: 1, pageSize: 20, totalCount: 1 });
    getMock.mockResolvedValue(planDetailEurOnly);
  });

  /**
   * Fix 4 (whole-branch review): `plans.list` defaults to a 25-row page; with no explicit `pageSize`
   * a 26th active plan silently could not be assigned. Pins the picker's request against the API's
   * documented ceiling (`PagedResult.MaxPageSize` = 200, GymOS-Backend) rather than letting a future
   * edit drop the parameter again unnoticed.
   */
  it('asks for a full page of assignable plans, not the default 25', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Assign plan' }));

    expect(listMock).toHaveBeenCalledWith(
      { includeInactive: false, pageSize: 200 },
      expect.anything(),
    );
  });

  it('limits the currency picker to the currencies the chosen plan actually prices', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Assign plan' }));
    await user.click(screen.getByLabelText('Plan'));
    await user.click(await screen.findByRole('option', { name: /Professional/ }));

    // The plan above prices only EUR (D-note: currency choice limited to what the plan prices).
    await user.click(screen.getByLabelText('Currency'));
    const currencyListbox = await screen.findByRole('listbox');
    expect(within(currencyListbox).getByRole('option', { name: 'EUR' })).toBeInTheDocument();
    expect(within(currencyListbox).queryByRole('option', { name: 'USD' })).not.toBeInTheDocument();
  });
});
