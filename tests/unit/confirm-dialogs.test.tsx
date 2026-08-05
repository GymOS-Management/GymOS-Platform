import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DestructiveConfirmDialog } from '@/components/feedback/confirm-dialogs';

/**
 * The type-to-confirm dialog (D7). What must hold: nothing is prefilled, the button stays disabled
 * until something is typed, exactly what was typed is what the caller receives, and the API's
 * refusal is shown next to the field rather than swallowed.
 */
function renderDialog(overrides: Partial<Parameters<typeof DestructiveConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();

  render(
    <DestructiveConfirmDialog
      open
      onOpenChange={() => {}}
      title="Delete Acme Gym?"
      description="This cannot be undone."
      expectedHint="Type the gym's address (acme-gym) to confirm"
      confirmLabel="Delete gym"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );

  return { onConfirm };
}

describe('DestructiveConfirmDialog', () => {
  it('starts empty with the confirm button disabled', () => {
    renderDialog();

    expect(screen.getByLabelText(/type the gym/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Delete gym' })).toBeDisabled();
  });

  it('sends exactly what the operator typed — the server judges it, not the client', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    // A wrong value is deliberately sendable: the API's refusal is the truth the operator sees.
    await user.type(screen.getByLabelText(/type the gym/i), 'not-the-right-gym');
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));

    expect(onConfirm).toHaveBeenCalledWith('not-the-right-gym');
  });

  it('trims surrounding whitespace — a trailing space is not a different answer', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.type(screen.getByLabelText(/type the gym/i), '  acme-gym  ');
    await user.click(screen.getByRole('button', { name: 'Delete gym' }));

    expect(onConfirm).toHaveBeenCalledWith('acme-gym');
  });

  it('shows the API’s refusal as an alert beside the field', () => {
    renderDialog({ errorMessage: 'That did not match the gym’s address. Nothing was changed.' });

    expect(screen.getByRole('alert')).toHaveTextContent(/did not match/i);
  });
});
