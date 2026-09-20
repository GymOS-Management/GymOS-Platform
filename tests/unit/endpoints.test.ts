import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetClientState, rememberEtag, setAccessToken } from '@/lib/api/client';
import {
  auditLogs,
  features,
  gyms,
  invoices,
  monitoring,
  plans,
  settings,
  users,
} from '@/lib/api/endpoints';

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  __resetClientState();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken('token');
});

afterEach(() => vi.unstubAllGlobals());

function headersOf(index: number): Record<string, string> {
  return (fetchMock.mock.calls[index]?.[1]?.headers ?? {}) as Record<string, string>;
}

function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('invoices.markPaid', () => {
  /** Three headers on one call is exactly where a client silently drops one (D5). */
  it('sends the idempotency key, the precondition and the payment reference together', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await invoices.markPaid('inv-1', 'ref-99', 'row-1', 'key-1');

    const headers = headersOf(0);
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(headers['If-Match']).toBe('"row-1"');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ paymentReference: 'ref-99' }));
  });
});

describe('invoices.void', () => {
  it('sends the invoice number as the step-up confirmation', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await invoices.void('inv-1', '2026-000042', 'row-1');

    expect(headersOf(0)['X-Confirm-Action']).toBe('2026-000042');
    expect(headersOf(0)['If-Match']).toBe('"row-1"');
  });
});

describe('plans.list', () => {
  it('drops empty filters from the query string', async () => {
    fetchMock.mockResolvedValueOnce(ok({ items: [] }));

    await plans.list({ page: 1, search: '', includeInactive: true });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/plans?page=1&includeInactive=true');
  });
});

describe('plans.update', () => {
  it('uses the ETag remembered from the matching read', async () => {
    rememberEtag('/plans/plan-1', '"row-7"');
    fetchMock.mockResolvedValueOnce(ok());

    await plans.update('plan-1', {
      name: 'Pro',
      description: null,
      trialDays: 14,
      sortOrder: 1,
      isPublic: true,
      maxMembers: null,
      maxStaff: null,
      maxTrainers: null,
      storageLimitMb: null,
    });

    expect(headersOf(0)['If-Match']).toBe('"row-7"');
  });
});

describe('features endpoints', () => {
  it('lists the catalogue with no query string — it is seeded, not paged', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await features.list();

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/features');
  });

  it('sends If-Match on a catalogue edit', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await features.update(
      'f1',
      {
        name: 'CRM',
        description: null,
        category: 'Members',
        defaultEnabled: true,
        isPremium: true,
      },
      'v7',
    );

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/features/f1');
    expect(headersOf(0)['If-Match']).toBe('"v7"');
  });

  it('sends NO If-Match when setting a gym’s features — each override is its own aggregate', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await gyms.setFeatures('g1', { features: [{ key: 'crm', isEnabled: true, reason: 'trial' }] });

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/gyms/g1/features');
    expect(headersOf(0)['If-Match']).toBeUndefined();
  });

  it('sends If-Match when setting a plan’s contents', async () => {
    fetchMock.mockResolvedValueOnce(ok());

    await plans.setFeatures('p1', { features: [{ key: 'crm', isEnabled: null }] }, 'v3');

    expect(headersOf(0)['If-Match']).toBe('"v3"');
  });
});

describe('the activation and reset sends', () => {
  it('returns what actually happened to the email, from the header', async () => {
    // Both endpoints answer 204 and report the outcome in X-Invitation-Email. The console used to
    // discard it and claim "has been sent" on any 204 — so with SMTP down an operator was told the
    // message went out, while the previous link had genuinely been invalidated. The destructive half
    // succeeds regardless, which is exactly why the claim has to be true.
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { 'X-Invitation-Email': 'failed' } }),
    );

    await expect(users.resendInvitation('user-1')).resolves.toBe('failed');
  });

  it('reports a disabled sender distinctly from a failed one', async () => {
    // Different operator action: `failed` means check the mail server, `disabled` means this
    // environment never attempts a send at all.
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 204, headers: { 'X-Invitation-Email': 'disabled' } }),
    );

    await expect(users.sendPasswordReset('user-1')).resolves.toBe('disabled');
  });

  it('returns null when the header is absent, rather than assuming success', async () => {
    // An older API, a proxy that strips it, a future rename: none of those are evidence a message
    // was delivered, so the caller must not be handed something it would read as "sent".
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(users.resendInvitation('user-1')).resolves.toBeNull();
  });
});

describe('monitoring endpoints', () => {
  it('encodes the job name and drops empty run filters', async () => {
    fetchMock.mockResolvedValueOnce(ok({ runs: [], hasMore: false }));

    await monitoring.runs('subscription-renewal', { status: 'Failed', to: undefined, limit: 50 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/v1/monitoring/jobs/subscription-renewal/runs?status=Failed&limit=50',
    );
  });

  it('reads the overview with no query string', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));

    await monitoring.overview();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/monitoring/overview');
  });
});

describe('settings endpoints', () => {
  it('narrows a read to one category, and reads everything when none is given', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));
    fetchMock.mockResolvedValueOnce(ok([]));

    await settings.list('Maintenance');
    await settings.list();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings?category=Maintenance');
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe('/api/v1/settings');
  });

  it('PUTs a category batch with NO If-Match — the endpoint takes none (Settings.md §5)', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await settings.update({
      category: 'General',
      values: [{ key: 'general.platform_name', value: 'X' }],
    });

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(headersOf(0)['If-Match']).toBeUndefined();
  });

  it('sends what the operator typed as X-Confirm-Action on the maintenance toggle', async () => {
    fetchMock.mockResolvedValueOnce(ok([]));

    await settings.setMaintenanceMode({ enabled: true, message: 'Back soon.' }, 'maintenance');

    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings/maintenance-mode');
    expect(headersOf(0)['X-Confirm-Action']).toBe('maintenance');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ enabled: true, message: 'Back soon.' }),
    );
  });

  it('posts the email probe with no body', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ ok: false, stage: 'Connect', server: null, error: 'refused' }),
    );

    await settings.testEmail();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/v1/settings/test-email');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });
});

describe('auditLogs.export', () => {
  it('builds the export path with the range and the current filter', async () => {
    fetchMock.mockResolvedValueOnce(new Response('id\r\n', { status: 200 }));

    await auditLogs.export({
      from: '2026-08-22T00:00:00Z',
      to: '2026-09-20T23:59:59Z',
      action: 'gym.',
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/v1/audit-logs/export?from=2026-08-22T00%3A00%3A00Z&to=2026-09-20T23%3A59%3A59Z&action=gym.',
    );
  });
});
