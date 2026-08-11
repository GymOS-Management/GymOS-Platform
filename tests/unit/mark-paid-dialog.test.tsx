import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkPaidDialog } from '@/features/invoices/mark-paid-dialog';

describe('MarkPaidDialog', () => {
  it('submits with the optional payment reference', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<MarkPaidDialog open onConfirm={onConfirm} onClose={() => {}} />);

    await userEvent.type(screen.getByLabelText(/payment reference/i), 'BANK-77');
    await userEvent.click(screen.getByRole('button', { name: /mark paid/i }));

    expect(onConfirm).toHaveBeenCalledWith('BANK-77');
  });

  it('submits without one, because the reference is optional', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<MarkPaidDialog open onConfirm={onConfirm} onClose={() => {}} />);

    await userEvent.click(screen.getByRole('button', { name: /mark paid/i }));

    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});
