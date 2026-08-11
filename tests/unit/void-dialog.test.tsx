import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { VoidDialog } from '@/features/invoices/void-dialog';

/** AD-6: the confirmation must be typed, never prefilled — a prefilled value confirms nothing. */
describe('VoidDialog', () => {
  it('stays disabled until the invoice number is typed exactly', async () => {
    const onConfirm = vi.fn();
    render(
      <VoidDialog open invoiceNumber="2026-000042" onConfirm={onConfirm} onClose={() => {}} />,
    );

    const confirm = screen.getByRole('button', { name: /void invoice/i });
    expect(confirm).toBeDisabled();

    // Off by one character (the last digit) — a near-miss must still leave the button disabled.
    await userEvent.type(screen.getByLabelText(/invoice number/i), '2026-000041');
    expect(confirm).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/invoice number/i));
    await userEvent.type(screen.getByLabelText(/invoice number/i), '2026-000042');
    expect(confirm).toBeEnabled();
  });

  /**
   * Fix 1 (whole-branch review): `onConfirm` used to be `() => Promise<void>` — called with no
   * arguments, so the caller (`invoice-detail.tsx`) had no choice but to reach for its own already-read
   * `invoiceNumber` instead of what the operator typed here. `X-Confirm-Action` then always matched by
   * construction and the backend's `invoices.confirmation_mismatch` branch was unreachable from this
   * UI. Asserting the call includes the typed string as its argument fails immediately if `onConfirm`
   * reverts to being invoked with no arguments.
   */
  it('sends what was typed to onConfirm, as its argument', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <VoidDialog open invoiceNumber="2026-000042" onConfirm={onConfirm} onClose={() => {}} />,
    );

    await userEvent.type(screen.getByLabelText(/invoice number/i), '2026-000042');
    await userEvent.click(screen.getByRole('button', { name: /void invoice/i }));

    expect(onConfirm).toHaveBeenCalledWith('2026-000042');
  });
});
