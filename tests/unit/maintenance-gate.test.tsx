import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceGate } from '@/components/feedback/maintenance-gate';
import { __resetClientState, api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/problems';

/**
 * The second of the banner's two feeds (F5-DESIGN D7): every 503 `settings.maintenance` the client
 * sees, from any request, reaches the gate through `onMaintenanceSet` and replaces the whole app
 * with the notice — never just the screen that happened to be polling. `client.test.ts` already
 * proves the client recognises the 503 and calls the handler; this file proves the gate renders
 * from it, keeps the first message, and cleans up its registration on unmount.
 */

function problemResponse(detail: string, retryAfter = '300'): Response {
  return new Response(JSON.stringify({ code: 'settings.maintenance', detail }), {
    status: 503,
    headers: { 'Content-Type': 'application/problem+json', 'Retry-After': retryAfter },
  });
}

/** `api.get`'s rejection drives a `setState` inside the gate's handler — flushed under `act`. */
async function getAndExpectMaintenance(path: string): Promise<void> {
  await act(async () => {
    await expect(api.get(path)).rejects.toBeInstanceOf(ApiError);
  });
}

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  __resetClientState();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MaintenanceGate (F5 D7)', () => {
  it('renders children until a 503 settings.maintenance arrives', () => {
    render(
      <MaintenanceGate>
        <p>app</p>
      </MaintenanceGate>,
    );

    expect(screen.getByText('app')).toBeVisible();
  });

  it('replaces the children with the notice, showing the API’s detail and retry time', async () => {
    fetchMock.mockResolvedValue(problemResponse('Down for scheduled maintenance.'));
    render(
      <MaintenanceGate>
        <p>app</p>
      </MaintenanceGate>,
    );

    await getAndExpectMaintenance('/gyms');

    expect(screen.queryByText('app')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Down for scheduled maintenance.');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in about 5 minutes.');
  });

  it('keeps the first message — a second 503 with a different detail changes nothing', async () => {
    fetchMock.mockResolvedValue(problemResponse('Down for scheduled maintenance.'));
    render(
      <MaintenanceGate>
        <p>app</p>
      </MaintenanceGate>,
    );

    await getAndExpectMaintenance('/gyms');
    expect(screen.getByRole('alert')).toHaveTextContent('Down for scheduled maintenance.');

    fetchMock.mockResolvedValue(problemResponse('A different message.'));
    await getAndExpectMaintenance('/users');

    expect(screen.getByRole('alert')).toHaveTextContent('Down for scheduled maintenance.');
    expect(screen.queryByText('A different message.')).toBeNull();
  });

  it('clears its registration on unmount, so a later 503 finds no handler', async () => {
    const { unmount } = render(
      <MaintenanceGate>
        <p>app</p>
      </MaintenanceGate>,
    );
    unmount();

    fetchMock.mockResolvedValue(problemResponse('Too late.'));

    // Nothing throws from calling the (now-cleared) handler, and nothing is left registered for the
    // client to call — proven by re-mounting fresh and seeing it start from "no notice" rather than
    // inheriting a stale one.
    await getAndExpectMaintenance('/gyms');

    render(
      <MaintenanceGate>
        <p>app again</p>
      </MaintenanceGate>,
    );
    expect(screen.getByText('app again')).toBeVisible();
  });

  describe('signing out from the notice', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...window.location, assign: vi.fn() },
        writable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    });

    it('posts to /auth/logout and lands on /login', async () => {
      fetchMock.mockImplementation(async (input) => {
        const url = typeof input === 'string' ? input : (input as Request).url;
        if (url.includes('/auth/logout')) {
          return new Response(null, { status: 204 });
        }
        return problemResponse('Down for scheduled maintenance.');
      });

      render(
        <MaintenanceGate>
          <p>app</p>
        </MaintenanceGate>,
      );
      await getAndExpectMaintenance('/gyms');

      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({ method: 'POST' }),
      );
      await vi.waitFor(() => {
        expect(window.location.assign).toHaveBeenCalledWith(`${window.location.origin}/login`);
      });
    });

    it('still lands on /login when the logout call itself is refused', async () => {
      fetchMock.mockResolvedValue(problemResponse('Down for scheduled maintenance.'));

      render(
        <MaintenanceGate>
          <p>app</p>
        </MaintenanceGate>,
      );
      await getAndExpectMaintenance('/gyms');

      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

      // Every call — the original GET and the logout POST — is refused by the same mock, proving the
      // navigation in the gate's `finally` fires regardless.
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({ method: 'POST' }),
      );
      await vi.waitFor(() => {
        expect(window.location.assign).toHaveBeenCalledWith(`${window.location.origin}/login`);
      });
    });
  });
});
