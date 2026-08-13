import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GymDetailPage from '@/app/(admin)/gyms/[gymId]/page';
import { gyms } from '@/lib/api/endpoints';

// Same stubbing rationale as gym-subscription-tab.test.tsx: GymStatusActions, OverviewTab, and
// BrandingForm all call usePermission/RequirePermission and useRouter, and this test wants the whole
// page tree without standing up a real SessionProvider or Next's app router.
vi.mock('@/lib/auth/session', () => ({
  usePermission: () => true,
  RequirePermission: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    gyms: { ...actual.gyms, get: vi.fn() },
  };
});

const gymsGetMock = gyms.get as ReturnType<typeof vi.fn>;

const baseGym = {
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
 * F4-DESIGN §6 (D9): `features` is optional on `GymDetail` and absent — not merely an empty array —
 * for a caller who holds `gyms.read` but not `features.read`. `usePermission` is stubbed to `true`
 * unconditionally above, so a regression that keyed the tab's visibility on a permission check
 * instead of the block's own presence would pass under this mock; only gating on `gym.features !=
 * null` catches it.
 */
describe('GymDetailPage — Features tab wiring (D9)', () => {
  it('renders no Features tab when the features block is absent', async () => {
    gymsGetMock.mockResolvedValue({ ...baseGym, features: null });

    await renderPage();

    await screen.findByText('Acme Gym');
    expect(screen.queryByRole('tab', { name: 'Features' })).not.toBeInTheDocument();
  });

  it('renders the Features tab when the block is present, even empty', async () => {
    gymsGetMock.mockResolvedValue({ ...baseGym, features: [] });

    await renderPage();

    await screen.findByText('Acme Gym');
    expect(screen.getByRole('tab', { name: 'Features' })).toBeInTheDocument();
  });
});
