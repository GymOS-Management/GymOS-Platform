import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceTable } from '@/features/invoices/invoice-table';

/**
 * D3: the server decides what is overdue. This row is `Issued` with a past due date and the server's
 * `isOverdue` true — the window before the hourly sweep relabels it. The UI must show the server's
 * answer, so a client that recomputed from `dueAtUtc` and a browser clock would disagree here.
 */
const issuedButOverdue = {
  id: 'i1',
  invoiceNumber: 'INV-2026-000001',
  gymId: 'g1',
  gymName: 'Downtown',
  status: 'Issued',
  isOverdue: true,
  total: 49.99,
  currency: 'EUR',
  issuedAtUtc: '2026-07-01T00:00:00Z',
  dueAtUtc: '2026-07-15T00:00:00Z',
  paidAtUtc: null,
};

// DataTable (src/components/data/data-table.tsx) renders every row twice by design — once as a
// desktop <table>, once as a mobile card list, toggled between purely by CSS — so a bare
// `screen.getByText` on row content always finds two matches. Scoped to the table half here rather
// than hiding a column, which is exactly the fix an earlier task got rejected for.
describe('InvoiceTable', () => {
  it('marks an Issued invoice overdue when the server says it is', () => {
    render(<InvoiceTable invoices={[issuedButOverdue]} emptyMessage="none" />);

    const table = within(screen.getByRole('table'));
    expect(table.getByText(/overdue/i)).toBeInTheDocument();
  });

  it('formats the total in the invoice currency', () => {
    render(<InvoiceTable invoices={[issuedButOverdue]} emptyMessage="none" />);

    const table = within(screen.getByRole('table'));
    expect(table.getByText(/49\.99/)).toBeInTheDocument();
  });

  it('renders the empty message when there are none', () => {
    render(<InvoiceTable invoices={[]} emptyMessage="No invoices yet" />);

    expect(screen.getByText('No invoices yet')).toBeInTheDocument();
  });

  /**
   * `onRowClick` must reach `DataTable` unchanged — that's what makes the whole row (not just a
   * link inside one cell) navigate, matching every other list in the console. This fails the moment
   * the prop stops being forwarded, since nothing else in the row would call the spy.
   */
  it('calls onRowClick with the clicked invoice', async () => {
    const onRowClick = vi.fn();
    const user = userEvent.setup();
    render(
      <InvoiceTable invoices={[issuedButOverdue]} emptyMessage="none" onRowClick={onRowClick} />,
    );

    const table = within(screen.getByRole('table'));
    await user.click(table.getByRole('row', { name: /INV-2026-000001/i }));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(issuedButOverdue);
  });
});
