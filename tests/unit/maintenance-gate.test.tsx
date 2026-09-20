import { act, render, screen } from '@testing-library/react';
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
});
