'use client';

import { use } from 'react';
import { InvoiceDetail } from '@/features/invoices/invoice-detail';

/**
 * One invoice, reached either from the cross-gym list or from a gym's own Invoices tab.
 *
 * `params` arrives as a `Promise` in this Next.js major; `use(params)` unwraps it inside a Client
 * Component the same way `gyms/[gymId]/page.tsx` does.
 */
export default function InvoiceDetailPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = use(params);

  return <InvoiceDetail invoiceId={invoiceId} />;
}
