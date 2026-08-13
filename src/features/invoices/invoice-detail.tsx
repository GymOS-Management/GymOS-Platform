'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, type Column } from '@/components/data/data-table';
import { StatusBadge } from '@/components/data/status-badge';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { MarkPaidDialog } from '@/features/invoices/mark-paid-dialog';
import { VoidDialog } from '@/features/invoices/void-dialog';
import { invoices } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { RequirePermission } from '@/lib/auth/session';
import { newIdempotencyKey } from '@/lib/billing/idempotency';
import { formatDate, formatMoney } from '@/lib/utils/format';
import type { InvoiceLineDetail } from '@/types/api';

/**
 * One invoice: header, its lines, and — while it is still open — the two actions that settle it.
 *
 * "Open" means `status` is `Issued` or `Overdue` (D6): a `Paid` or `Void` invoice is a closed record,
 * so neither action is offered for it, gated permission or not.
 *
 * `isOverdue` is rendered exactly as the server sends it, never recomputed from `dueAtUtc` — same rule
 * as `InvoiceTable` (D3), for the same reason: the hourly overdue sweep can be lagging behind the
 * server's own answer, and this screen must not disagree with it.
 */
export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'markPaid' | 'void' | null>(null);

  const query = useQuery({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: ({ signal }) => invoices.get(invoiceId, signal),
    refetchOnWindowFocus: true,
  });

  const fail = (error: unknown) => {
    toastApiError(error);
  };

  /**
   * D1: the idempotency key belongs to the operator's intent, so it is minted by the caller — in
   * `handleMarkPaid` below, once per press of the dialog's button — and carried into the mutation as
   * part of `MarkPaidIntent`. Minting it here, inside `mutationFn`, would hand a fresh key to every
   * retry (the API client's post-refresh retry, or React Query's own network retry), presenting the
   * backend with what looks like a second payment rather than a replay of the first — the exact
   * failure AD-39 exists to prevent.
   */
  const markPaid = useMutation({
    mutationFn: ({
      paymentReference,
      idempotencyKey,
    }: {
      paymentReference: string | null;
      idempotencyKey: string;
    }) => invoices.markPaid(invoiceId, paymentReference, query.data!.rowVersion, idempotencyKey),
    onSuccess: (updated) => {
      queryClient.setQueryData(['invoices', 'detail', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Paying the last open invoice of the current period settles a PastDue subscription
      // server-side, so the subscription card is stale the moment this succeeds.
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('Invoice marked paid.');
      setDialog(null);
    },
    onError: fail,
  });

  const voidInvoice = useMutation({
    mutationFn: (confirmation: string) =>
      invoices.void(invoiceId, confirmation, query.data!.rowVersion),
    onSuccess: (updated) => {
      queryClient.setQueryData(['invoices', 'detail', updated.id], updated);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      // Voiding the last open invoice of the current period settles a PastDue subscription
      // server-side (PastDueRecovery runs on this path too), so the subscription card is stale
      // the moment this succeeds — same reasoning as markPaid's invalidation above.
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      toast.success('Invoice voided.');
      setDialog(null);
    },
    onError: fail,
  });

  // The dialog's submit handler — one key per press of the button.
  async function handleMarkPaid(paymentReference: string | null): Promise<void> {
    await markPaid.mutateAsync({ paymentReference, idempotencyKey: newIdempotencyKey() });
  }

  async function handleVoid(typed: string): Promise<void> {
    await voidInvoice.mutateAsync(typed);
  }

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const error = query.error;
    return <PageHeader title="Invoice unavailable" description={<ApiErrorText error={error} />} />;
  }

  const invoice = query.data;
  const isOpen = invoice.status === 'Issued' || invoice.status === 'Overdue';

  const lineColumns: Column<InvoiceLineDetail>[] = [
    {
      key: 'description',
      header: 'Description',
      primary: true,
      render: (line) => line.description,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (line) => formatMoney(line.amount, line.currency),
    },
  ];

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{invoice.invoiceNumber}</span>
            <StatusBadge status={invoice.status} />
            {invoice.isOverdue && invoice.status !== 'Overdue' && <StatusBadge status="Overdue" />}
          </span>
        }
        description={
          <Link href={`/gyms/${invoice.gymId}`} className="hover:underline">
            {invoice.gymName}
          </Link>
        }
        actions={
          isOpen && (
            <RequirePermission permission="billing.manage">
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDialog('markPaid')}>Mark paid</Button>
                <Button variant="destructive" onClick={() => setDialog('void')}>
                  Void
                </Button>
              </div>
            </RequirePermission>
          )
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Issued" value={formatDate(invoice.issuedAtUtc)} />
              <Field label="Due" value={formatDate(invoice.dueAtUtc)} />
              <Field label="Paid" value={formatDate(invoice.paidAtUtc)} />
              {invoice.paymentReference && (
                <Field label="Payment reference" value={invoice.paymentReference} />
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DataTable
              columns={lineColumns}
              rows={invoice.lines}
              rowKey={(line) => line.id}
              empty={<p className="text-muted-foreground text-sm">No line items.</p>}
            />

            <dl className="ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-right">{formatMoney(invoice.subtotal, invoice.currency)}</dd>
              <dt className="text-muted-foreground">Tax ({formatPercent(invoice.taxRate)})</dt>
              <dd className="text-right">{formatMoney(invoice.taxAmount, invoice.currency)}</dd>
              <dt className="font-medium">Total</dt>
              <dd className="text-right font-medium">
                {formatMoney(invoice.total, invoice.currency)}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <MarkPaidDialog
        open={dialog === 'markPaid'}
        onConfirm={handleMarkPaid}
        onClose={() => setDialog(null)}
      />

      <VoidDialog
        open={dialog === 'void'}
        invoiceNumber={invoice.invoiceNumber}
        onConfirm={handleVoid}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** `taxRate` arrives as a fraction (e.g. `0.075`); shown as a percentage for a human reading an invoice. */
function formatPercent(rate: number | string): string {
  const value = typeof rate === 'string' ? Number(rate) : rate;
  if (!Number.isFinite(value)) {
    return '—';
  }
  // Render the real rate (e.g. 7.5%), not a rounded one — this figure sits next to an exact amount
  // on a financial document.
  const percent = value * 100;
  const rounded = Math.round(percent * 100) / 100;
  return `${rounded}%`;
}
