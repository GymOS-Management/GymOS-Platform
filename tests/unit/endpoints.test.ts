import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetClientState, rememberEtag, setAccessToken } from '@/lib/api/client';
import { invoices, plans } from '@/lib/api/endpoints';

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

    await invoices.void('inv-1', 'INV-2026-000042', 'row-1');

    expect(headersOf(0)['X-Confirm-Action']).toBe('INV-2026-000042');
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
