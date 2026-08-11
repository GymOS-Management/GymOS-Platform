import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VoidDialog } from '@/features/invoices/void-dialog';

/** AD-6: the confirmation must be typed, never prefilled — a prefilled value confirms nothing. */
describe('VoidDialog', () => {
  it('stays disabled until the invoice number is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(
      <VoidDialog open invoiceNumber="INV-2026-000042" onConfirm={onConfirm} onClose={() => {}} />,
    );

    const confirm = screen.getByRole('button', { name: /void invoice/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/invoice number/i), 'INV-2026-000041');
    expect(confirm).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/invoice number/i));
    await userEvent.type(screen.getByLabelText(/invoice number/i), 'INV-2026-000042');
    expect(confirm).toBeEnabled();
  });
});
