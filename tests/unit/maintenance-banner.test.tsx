import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceBanner } from '@/features/settings/maintenance-banner';
import { __resetClientState, setAccessToken } from '@/lib/api/client';

/**
 * The first of the banner's two feeds (F5-DESIGN D7): a `settings.read` holder polls the
 * Maintenance category and sees a banner while they keep working; anyone else is never polled at
 * all — their own next request is the second feed's 503, covered by `maintenance-gate.test.tsx`.
 */

const { permissionState } = vi.hoisted(() => ({ permissionState: { canRead: true } }));

vi.mock('@/lib/auth/session', () => ({
  usePermission: () => permissionState.canRead,
}));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function view(key: string, value: string) {
  return {
    key,
    category: 'Maintenance' as const,
    valueType: (key.endsWith('enabled') ? 'Bool' : 'String') as 'Bool' | 'String',
    isSensitive: false,
    description: '',
    value,
    source: 'Default' as const,
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
  };
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

function renderBanner() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MaintenanceBanner />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  __resetClientState();
  setAccessToken('token');
  permissionState.canRead = true;
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MaintenanceBanner (F5 D7)', () => {
  it('fetches nothing and renders nothing without settings.read', async () => {
    permissionState.canRead = false;
    renderBanner();

    // Nothing to await on success, so give any accidental fetch a turn to happen before asserting.
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing while maintenance.enabled is false', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        view('maintenance.enabled', 'false'),
        view('maintenance.message', 'Back soon.'),
      ]),
    );
    renderBanner();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the status banner with the message when maintenance.enabled is "True"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        view('maintenance.enabled', 'True'),
        view('maintenance.message', 'Back at 03:00 UTC.'),
      ]),
    );
    renderBanner();

    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('Maintenance mode is on.');
    expect(banner).toHaveTextContent('Back at 03:00 UTC.');
  });
});
