import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetClientState,
  api,
  bootstrapSession,
  getAccessToken,
  onSessionLostSet,
  query,
  rememberEtag,
  setAccessToken,
} from '@/lib/api/client';
import { ApiError } from '@/lib/api/problems';

/**
 * The API client's real logic. The single-flight refresh cases are the reason this file exists: the
 * backend rotates refresh tokens and treats a replayed one as an attack (revoking the chain), so a
 * client that fires two refreshes for two concurrent 401s signs the operator out *by way of its own
 * recovery logic*. That failure would look like random logouts in production and nothing in a demo.
 */

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function problemResponse(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ code, detail: `problem ${code}`, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  __resetClientState();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestsTo(url: string): number {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(url)).length;
}

function headersOfCall(index: number): Record<string, string> {
  const init = fetchMock.mock.calls[index]?.[1];
  return (init?.headers ?? {}) as Record<string, string>;
}

describe('single-flight refresh (D4)', () => {
  it('three concurrent 401s produce exactly one refresh, and all three retries succeed', async () => {
    setAccessToken('stale-token');

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        // Slow enough that all three 401s land before it resolves.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return jsonResponse({ accessToken: 'fresh-token' });
      }

      const auth = (init?.headers as Record<string, string>)?.['Authorization'];
      if (auth === 'Bearer stale-token') {
        return problemResponse(401, 'auth.session_expired');
      }

      return jsonResponse({ ok: true, url });
    });

    const results = await Promise.all([
      api.get('/gyms'),
      api.get('/users'),
      api.get('/audit-logs'),
    ]);

    expect(results).toHaveLength(3);

    // The property under test: one refresh, not three. Two extra refreshes would present
    // already-rotated tokens, and the backend's reuse detection would revoke the session.
    expect(requestsTo('/auth/refresh')).toBe(1);
    expect(getAccessToken()).toBe('fresh-token');
  });

  it('a failed refresh fails all waiting requests and reports the session as lost', async () => {
    setAccessToken('stale-token');
    const sessionLost = vi.fn();
    onSessionLostSet(sessionLost);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        return problemResponse(401, 'auth.session_expired');
      }

      return problemResponse(401, 'auth.session_expired');
    });

    await expect(api.get('/gyms')).rejects.toBeInstanceOf(ApiError);
    expect(sessionLost).toHaveBeenCalledTimes(1);

    // Only one refresh was attempted for the failed request — no loop.
    expect(requestsTo('/auth/refresh')).toBe(1);
  });

  it('retries the original request exactly once after a successful refresh — never twice', async () => {
    setAccessToken('stale-token');

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        return jsonResponse({ accessToken: 'fresh-token' });
      }

      // Still 401 even with the fresh token: the account was suspended mid-request.
      return problemResponse(401, 'auth.session_expired');
    });

    await expect(api.get('/gyms')).rejects.toBeInstanceOf(ApiError);

    // Original + one retry. A third attempt would mean the retry can itself trigger a retry.
    expect(requestsTo('/gyms')).toBe(2);
    expect(requestsTo('/auth/refresh')).toBe(1);
  });

  it('a failed refresh does not wedge later requests — the next 401 may try again', async () => {
    setAccessToken('stale');
    onSessionLostSet(() => {});

    let refreshCalls = 0;

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return refreshCalls === 1
          ? problemResponse(401, 'auth.session_expired')
          : jsonResponse({ accessToken: 'recovered' });
      }

      const auth = (init?.headers as Record<string, string>)?.['Authorization'];
      return auth === 'Bearer recovered'
        ? jsonResponse({ ok: true })
        : problemResponse(401, 'auth.session_expired');
    });

    await expect(api.get('/gyms')).rejects.toBeInstanceOf(ApiError);

    // The user signed in again elsewhere, or the first failure was transient: recovery must work.
    await expect(api.get('/gyms')).resolves.toEqual({ ok: true });
    expect(refreshCalls).toBe(2);
  });

  it('bootstrapSession returns the token from the cookie exchange and stores it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ accessToken: 'booted' }));

    await expect(bootstrapSession()).resolves.toBe('booted');
    expect(getAccessToken()).toBe('booted');
  });
});

describe('optimistic concurrency plumbing (D6)', () => {
  it('remembers the ETag from a read and sends it as If-Match on the write', async () => {
    setAccessToken('token');

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { id: 'g1' },
          { headers: { 'Content-Type': 'application/json', ETag: '"742"' } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'g1' }));

    await api.get('/gyms/g1');
    await api.put('/gyms/g1', { name: 'Renamed' }, { precondition: true });

    expect(headersOfCall(1)['If-Match']).toBe('"742"');
  });

  it('quotes an explicit rowVersion exactly once', async () => {
    setAccessToken('token');
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(async () => jsonResponse({}));

    await api.put('/gyms/g1/branding', {}, { precondition: '743' });
    expect(headersOfCall(0)['If-Match']).toBe('"743"');

    await api.put('/gyms/g1/branding', {}, { precondition: '"744"' });
    expect(headersOfCall(1)['If-Match']).toBe('"744"');
  });

  it('surfaces a stale write as a non-retryable conflict', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(problemResponse(409, 'concurrency.conflict', { retryable: false }));

    const failure = await api.put('/gyms/g1', {}, { precondition: '1' }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).isConflict).toBe(true);
    expect((failure as ApiError).retryable).toBe(false);
  });

  it('flags a 428 as the console’s own defect, not the operator’s', async () => {
    setAccessToken('token');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValue(problemResponse(428, 'concurrency.version_required'));

    const failure = await api
      .put('/gyms/g1', {}, { precondition: true }) // no ETag remembered → nothing sent
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect((failure as ApiError).isPreconditionDefect).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('step-up confirmation (D7 / AD-6)', () => {
  it('sends what the operator typed as X-Confirm-Action, verbatim', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await api.delete('/gyms/g1', { confirmation: 'acme-gym' });

    expect(headersOfCall(0)['X-Confirm-Action']).toBe('acme-gym');
  });

  it('a wrong confirmation surfaces the API’s refusal, mapped for the field', async () => {
    setAccessToken('token');
    fetchMock.mockResolvedValue(problemResponse(400, 'gyms.confirmation_mismatch'));

    const failure = await api.delete('/gyms/g1', { confirmation: 'wrong-gym' }).then(
      () => null,
      (error: unknown) => error,
    );

    expect((failure as ApiError).code).toBe('gyms.confirmation_mismatch');
    expect((failure as ApiError).message).toContain('did not match');
  });
});

describe('etag lifecycle', () => {
  it('forgetting etags on sign-out leaves nothing to precondition with', async () => {
    rememberEtag('/gyms/g1', '"7"');
    setAccessToken('token');

    const { forgetEtags, knownEtag } = await import('@/lib/api/client');
    forgetEtags();

    expect(knownEtag('/gyms/g1')).toBeUndefined();
  });
});

describe('query()', () => {
  it('drops empty values so cleared filters leave no trace', () => {
    expect(query({ page: 2, search: '', status: undefined, includeDeleted: false })).toBe(
      '?page=2&includeDeleted=false',
    );
    expect(query({})).toBe('');
  });
});
