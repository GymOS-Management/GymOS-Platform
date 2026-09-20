import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExportDialog } from '@/features/audit/export-dialog';
import { ApiError } from '@/lib/api/problems';

const today = new Date('2026-09-20T12:00:00Z');

function renderDialog(overrides: Partial<React.ComponentProps<typeof ExportDialog>> = {}) {
  const onExport = vi.fn();
  render(
    <ExportDialog
      open
      onOpenChange={vi.fn()}
      action=""
      today={today}
      busy={false}
      error={null}
      onExport={onExport}
      {...overrides}
    />,
  );
  return onExport;
}

describe('ExportDialog (D8)', () => {
  it('opens on the last 30 days and exports that range', async () => {
    const onExport = renderDialog();

    expect(screen.getByLabelText('From')).toHaveValue('2026-08-22');
    expect(screen.getByLabelText('To')).toHaveValue('2026-09-20');

    await userEvent.click(screen.getByRole('button', { name: 'Export' }));

    expect(onExport).toHaveBeenCalledWith({ from: '2026-08-22', to: '2026-09-20' });
  });

  it('refuses a range past 366 days before asking the API', async () => {
    const onExport = renderDialog();

    await userEvent.clear(screen.getByLabelText('From'));
    await userEvent.type(screen.getByLabelText('From'), '2025-01-01');

    expect(screen.getByRole('alert')).toHaveTextContent(/366/);
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(onExport).not.toHaveBeenCalled();
  });

  it('names the current action filter it will carry', () => {
    renderDialog({ action: 'gym.' });

    expect(screen.getByText(/actions starting/)).toHaveTextContent('gym.');
  });

  it('says the export is itself recorded in the audit log', () => {
    renderDialog();

    expect(screen.getByText(/recorded in the audit log/)).toBeVisible();
  });

  it('still shows the API’s refusal, because a URL can be hand-edited', () => {
    renderDialog({
      error: new ApiError(
        400,
        'audit.export_range',
        'An audit export covers at most 366 days.',
        false,
      ),
    });

    expect(screen.getAllByRole('alert').some((node) => /366/.test(node.textContent ?? ''))).toBe(
      true,
    );
  });
});
