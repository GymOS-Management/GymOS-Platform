import { Receipt } from 'lucide-react';
import { DataTable, type Column } from '@/components/data/data-table';
import { EmptyState } from '@/components/data/empty-state';
import { StatusBadge } from '@/components/data/status-badge';
import { formatDate, formatMoney } from '@/lib/utils/format';
import type { InvoiceListItem } from '@/types/api';

/**
 * The invoice list, shared by the gym detail Invoices tab (Task 8) and the cross-gym invoices list
 * (Task 9) — presentational only, no data fetching and no `useRouter`, so each caller supplies its own
 * query and its own navigation.
 *
 * `onRowClick` is optional and passed straight through to `DataTable`, which makes the whole desktop
 * `<tr>` and the whole mobile `<li>` clickable — matching every other list in the console
 * (gyms/page.tsx, plans/page.tsx, audit-logs/page.tsx all do the same via `DataTable`). The Number
 * column is plain text, not a nested `<a>`: with the entire row already clickable, a link inside it
 * would either double-fire the navigation or, if its own click were stopped, sit there as a dead,
 * nested interactive element — same reason `gyms/page.tsx`'s primary column is plain text too.
 *
 * The overdue sweep runs hourly and re-labels `Issued` invoices to `Overdue` with no operator action.
 * In the window between an invoice falling due and the next sweep, `status` can still read `Issued`
 * while the server's `isOverdue` is already true — that is not a client bug to "fix" by recomputing
 * from `dueAtUtc`, it is the server's answer, and this table renders exactly that (D3). A second
 * "Overdue" marker is only added when `status` itself hasn't caught up yet, so a `status: 'Overdue'`
 * row never shows the word twice.
 */
export function InvoiceTable({
  invoices,
  emptyMessage,
  onRowClick,
}: {
  invoices: InvoiceListItem[];
  emptyMessage: string;
  /** When supplied, the whole row navigates, matching every other list in the console. */
  onRowClick?: (invoice: InvoiceListItem) => void;
}) {
  const columns: Column<InvoiceListItem>[] = [
    {
      key: 'invoiceNumber',
      header: 'Number',
      primary: true,
      render: (invoice) => <span className="font-mono text-xs">{invoice.invoiceNumber}</span>,
    },
    {
      key: 'issuedAtUtc',
      header: 'Issued',
      render: (invoice) => formatDate(invoice.issuedAtUtc),
    },
    {
      key: 'dueAtUtc',
      header: 'Due',
      render: (invoice) => formatDate(invoice.dueAtUtc),
    },
    {
      key: 'total',
      header: 'Total',
      render: (invoice) => formatMoney(invoice.total, invoice.currency),
    },
    {
      key: 'status',
      header: 'Status',
      render: (invoice) => (
        <span className="flex items-center gap-2">
          <StatusBadge status={invoice.status} />
          {invoice.isOverdue && invoice.status !== 'Overdue' && <StatusBadge status="Overdue" />}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={invoices}
      rowKey={(invoice) => invoice.id}
      onRowClick={onRowClick}
      empty={<EmptyState icon={Receipt} title={emptyMessage} />}
    />
  );
}
