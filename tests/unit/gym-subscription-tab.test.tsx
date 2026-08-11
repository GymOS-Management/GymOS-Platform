import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GymDetailPage from '@/app/(admin)/gyms/[gymId]/page';
import { gyms, subscriptions } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';

// The tab's permission gating is exercised by subscription-card.test.tsx and
// subscription-actions.test.tsx already; stubbed here so this file can render the whole page tree
// (GymStatusActions, OverviewTab, BrandingForm all call usePermission/RequirePermission too) without
// standing up a real SessionProvider and its auth bootstrap.
vi.mock('@/lib/auth/session', () => ({
  usePermission: () => true,
  RequirePermission: ({ children }: { children: React.ReactNode }) => children,
}));

// GymStatusActions (rendered in the page header regardless of which tab is active) calls
// `useRouter()`; outside Next's own app-router test harness that throws "expected app router to be
// mounted", unrelated to anything this test is about.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    gyms: { ...actual.gyms, get: vi.fn() },
    subscriptions: { ...actual.subscriptions, get: vi.fn() },
  };
});

const gymsGetMock = gyms.get as ReturnType<typeof vi.fn>;
const subscriptionsGetMock = subscriptions.get as ReturnType<typeof vi.fn>;

const gym = {
  id: 'g1',
  name: 'Acme Gym',
  slug: 'acme-gym',
  status: 'Active',
  ownerName: 'Jane Doe',
  ownerEmail: 'jane@acme.test',
  phone: null,
  countryCode: 'CY',
  currency: 'EUR',
  timeZoneId: 'Asia/Nicosia',
  createdAtUtc: '2026-01-01T00:00:00Z',
  deletedAtUtc: null,
  suspensionReason: null,
  rowVersion: 'row-1',
  subscription: null,
  branding: {
    customDomain: null,
    emailSenderName: null,
    faviconUrl: null,
    logoUrl: null,
    primaryColour: null,
    secondaryColour: null,
  },
};

async function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result: ReturnType<typeof render>;

  // `use(params)` suspends on the first render and resolves on a microtask; Next's App Router supplies
  // both the Suspense boundary and the `act` flush for that automatically, so a test rendering the page
  // component directly must supply both itself, or the resolved promise's re-render never commits.
  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <GymDetailPage params={Promise.resolve({ gymId: 'g1' })} />
        </Suspense>
      </QueryClientProvider>,
    );
  });

  return result!;
}

/**
 * `subscriptions.get` 404s for a gym that has never been assigned a plan — the intended "no
 * subscription yet" state, not a failure. A regression that let the tab's generic error branch catch a
 * 404 (or that dropped the `isNotFound` check entirely) would show "Something went wrong." — or a blank
 * panel — to an operator on the single most common state a freshly provisioned gym is in.
 */
describe('GymDetailPage — Subscription tab wiring', () => {
  it('renders the "Assign plan" empty state on a 404, not an error panel', async () => {
    gymsGetMock.mockResolvedValue(gym);
    subscriptionsGetMock.mockRejectedValue(new ApiError(404, undefined, undefined, false));

    const user = userEvent.setup();
    await renderPage();

    await screen.findByText('Acme Gym');
    await user.click(screen.getByRole('tab', { name: 'Subscription' }));

    expect(await screen.findByText('No subscription')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign plan' })).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });
});
