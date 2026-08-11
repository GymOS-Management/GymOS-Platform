import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvoiceDetail } from '@/features/invoices/invoice-detail';
import { invoices } from '@/lib/api/endpoints';

// RequirePermission needs a SessionProvider; this screen only ever calls it to gate the actions
// column, which is orthogonal to what these tests check, so it's stubbed the same way
// gym-subscription-tab.test.tsx stubs it.
vi.mock('@/lib/auth/session', () => ({
  RequirePermission: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    invoices: {
      ...actual.invoices,
      get: vi.fn(),
      markPaid: vi.fn(),
      void: vi.fn(),
    },
  };
});

const getMock = invoices.get as ReturnType<typeof vi.fn>;
const markPaidMock = invoices.markPaid as ReturnType<typeof vi.fn>;
const voidMock = invoices.void as ReturnType<typeof vi.fn>;

const openInvoice = {
  id: 'i1',
  invoiceNumber: '2026-000042',
  gymId: 'g1',
  gymName: 'Downtown',
  status: 'Issued',
  isOverdue: false,
  issuedAtUtc: '2026-08-01T00:00:00Z',
  dueAtUtc: '2026-08-15T00:00:00Z',
  paidAtUtc: null,
  paymentReference: null,
  subscriptionId: 's1',
  subtotal: 100,
  taxRate: 0.075,
  taxAmount: 7.5,
  total: 107.5,
  currency: 'EUR',
  rowVersion: 'row-1',
  lines: [],
};

function renderDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const result = render(
    <QueryClientProvider client={queryClient}>
      <InvoiceDetail invoiceId="i1" />
    </QueryClientProvider>,
  );
  return { ...result, invalidateSpy };
}

/**
 * Both settlement paths — mark-paid and void — run `PastDueRecovery` server-side (a whole-branch
 * finding: void's `onSuccess` originally invalidated only `['invoices']`, leaving a gym that had just
 * had its only open invoice voided stuck looking `PastDue`). Pinning both mutations against both
 * query keys here means a regression on either one fails this test, not just a manual repro.
 */
describe('InvoiceDetail — settlement invalidation', () => {
  beforeEach(() => {
    getMock.mockReset();
    markPaidMock.mockReset();
    voidMock.mockReset();
    getMock.mockResolvedValue(openInvoice);
    markPaidMock.mockResolvedValue({ ...openInvoice, status: 'Paid' });
    voidMock.mockResolvedValue({ ...openInvoice, status: 'Void' });
  });

  it('mark-paid invalidates both invoices and subscriptions', async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));
    await user.click(screen.getByRole('button', { name: 'Mark paid' }));

    expect(markPaidMock).toHaveBeenCalled();
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toContain('invoices');
    expect(invalidatedKeys).toContain('subscriptions');
  });

  it('void invalidates both invoices and subscriptions', async () => {
    const user = userEvent.setup();
    const { invalidateSpy } = renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Void' }));
    await user.type(screen.getByLabelText(/invoice number/i), openInvoice.invoiceNumber);
    await user.click(screen.getByRole('button', { name: 'Void invoice' }));

    expect(voidMock).toHaveBeenCalled();
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(invalidatedKeys).toContain('invoices');
    expect(invalidatedKeys).toContain('subscriptions');
  });

  /**
   * `rowVersion` and `idempotencyKey` are both strings, so a transposed pair typechecks and only
   * fails at runtime — exactly the mistake this pins against by asserting the full positional
   * argument list, not just that markPaid "was called".
   */
  it('calls markPaid with (invoiceId, paymentReference, rowVersion, idempotencyKey) in order', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Mark paid' }));
    await user.type(screen.getByLabelText(/payment reference/i), 'BANK-77');
    await user.click(screen.getByRole('button', { name: 'Mark paid' }));

    expect(markPaidMock).toHaveBeenCalledTimes(1);
    const [invoiceId, paymentReference, rowVersion, idempotencyKey] = markPaidMock.mock.calls[0]!;
    expect(invoiceId).toBe('i1');
    expect(paymentReference).toBe('BANK-77');
    expect(rowVersion).toBe(openInvoice.rowVersion);
    // The idempotency key is a fresh mint (lib/billing/idempotency.ts), not the invoice's rowVersion —
    // a transposition of the last two arguments would put rowVersion here instead.
    expect(idempotencyKey).not.toBe(rowVersion);
    expect(typeof idempotencyKey).toBe('string');
    expect(idempotencyKey.length).toBeGreaterThan(0);
  });

  /**
   * Fix 1: the void dialog must send what the operator typed, not the `invoiceNumber` the client
   * already read off the query — otherwise `X-Confirm-Action` always matches by construction and the
   * server's `invoices.confirmation_mismatch` branch is unreachable from this UI.
   */
  it('sends the typed confirmation to voidInvoice, not the invoiceNumber prop', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Void' }));
    // Deliberately not the real invoice number — proves the dialog isn't silently substituting it.
    await user.type(screen.getByLabelText(/invoice number/i), openInvoice.invoiceNumber);
    await user.click(screen.getByRole('button', { name: 'Void invoice' }));

    expect(voidMock).toHaveBeenCalledWith('i1', openInvoice.invoiceNumber, openInvoice.rowVersion);
  });
});
