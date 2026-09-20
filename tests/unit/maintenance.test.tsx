import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MaintenanceNotice } from '@/components/feedback/maintenance-notice';
import { MaintenanceSection } from '@/features/settings/maintenance-section';
import { maintenanceState } from '@/lib/settings/maintenance';
import type { SettingView } from '@/types/api';

function view(key: string, value: string): SettingView {
  return {
    key,
    category: 'Maintenance',
    valueType: key.endsWith('enabled') ? 'Bool' : 'String',
    isSensitive: false,
    description: '',
    value,
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
  };
}

const off = [view('maintenance.enabled', 'false'), view('maintenance.message', 'Back shortly.')];
const on = [view('maintenance.enabled', 'True'), view('maintenance.message', 'Back at 03:00 UTC.')];

describe('maintenanceState', () => {
  it('reads the two keys, tolerating the server’s casing of the bool', () => {
    expect(maintenanceState(on)).toEqual({ enabled: true, message: 'Back at 03:00 UTC.' });
    expect(maintenanceState(off).enabled).toBe(false);
  });
});

describe('MaintenanceSection (D7)', () => {
  it('sends what the operator typed, verbatim, with the message — and does not check it itself', async () => {
    const onEnable = vi.fn();
    render(
      <MaintenanceSection
        settings={off}
        canManage
        busy={false}
        errorMessage={null}
        onEnable={onEnable}
        onDisable={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable maintenance mode' }));
    await userEvent.clear(screen.getByLabelText('Message shown to refused callers'));
    await userEvent.type(
      screen.getByLabelText('Message shown to refused callers'),
      'Upgrading the database.',
    );
    await userEvent.type(screen.getByLabelText(/type maintenance to confirm/i), 'maintenanec');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable maintenance mode' }),
    );

    // The typo goes to the API, which refuses it (`settings.confirmation_mismatch`); a local check
    // would hide that the server is the one judging.
    expect(onEnable).toHaveBeenCalledWith('maintenanec', 'Upgrading the database.');
  });

  it('keeps the API’s refusal inside the dialog, beside the field', async () => {
    render(
      <MaintenanceSection
        settings={off}
        canManage
        busy={false}
        errorMessage="That did not match."
        onEnable={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable maintenance mode' }));

    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'That did not match.',
    );
  });

  it('disables through a plain confirmation', async () => {
    const onDisable = vi.fn();
    render(
      <MaintenanceSection
        settings={on}
        canManage
        busy={false}
        errorMessage={null}
        onEnable={vi.fn()}
        onDisable={onDisable}
      />,
    );

    expect(screen.getByText(/Back at 03:00 UTC/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Disable maintenance mode' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Disable' }),
    );

    expect(onDisable).toHaveBeenCalledTimes(1);
  });

  it('clears the refusal when the enable dialog is closed, so reopening it starts clean', async () => {
    const onDialogClose = vi.fn();
    render(
      <MaintenanceSection
        settings={off}
        canManage
        busy={false}
        errorMessage="That did not match."
        onEnable={vi.fn()}
        onDisable={vi.fn()}
        onEnableDialogClose={onDialogClose}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Enable maintenance mode' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'That did not match.',
    );

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    );

    expect(onDialogClose).toHaveBeenCalledTimes(1);
  });

  it('offers neither button without settings.manage (D9)', () => {
    render(
      <MaintenanceSection
        settings={on}
        canManage={false}
        busy={false}
        errorMessage={null}
        onEnable={vi.fn()}
        onDisable={vi.fn()}
      />,
    );

    expect(screen.getByText('On')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('MaintenanceNotice (D7)', () => {
  it('shows the API’s message and the retry time in minutes', () => {
    render(<MaintenanceNotice message="Back at 03:00 UTC." retryAfterSeconds={300} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Maintenance in progress');
    expect(screen.getByRole('alert')).toHaveTextContent('Back at 03:00 UTC.');
    expect(screen.getByRole('alert')).toHaveTextContent('Try again in about 5 minutes.');
  });

  it('omits the retry line when the API sent no Retry-After', () => {
    render(<MaintenanceNotice message="Back soon." retryAfterSeconds={null} />);

    expect(screen.queryByText(/Try again in about/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
