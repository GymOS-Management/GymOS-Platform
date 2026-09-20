import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SettingsCategoryForm } from '@/features/settings/settings-category-form';
import { SETTING_MASK, type SettingView } from '@/types/api';

function setting(partial: Partial<SettingView>): SettingView {
  return {
    key: 'general.platform_name',
    category: 'General',
    valueType: 'String',
    isSensitive: false,
    description: 'Shown in the console header.',
    value: 'GymOS',
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
    ...partial,
  };
}

const platformName = setting({});
const smtpPort = setting({
  key: 'email.smtp_port',
  category: 'Email',
  valueType: 'Int',
  value: '1025',
  source: 'Configuration',
  description: 'The SMTP relay port.',
});
const startTls = setting({
  key: 'email.smtp_use_starttls',
  category: 'Email',
  valueType: 'Bool',
  value: 'false',
  description: 'Upgrade the connection to TLS before authenticating.',
});
const smtpPassword = setting({
  key: 'email.smtp_password',
  category: 'Email',
  isSensitive: true,
  value: SETTING_MASK,
  source: 'Database',
});

function renderForm(settings: SettingView[], canManage = true, onSave = vi.fn()) {
  render(
    <SettingsCategoryForm
      settings={settings}
      canManage={canManage}
      busy={false}
      error={null}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('SettingsCategoryForm', () => {
  it('renders each row by its declared type, with its source and description (D5)', () => {
    renderForm([platformName, smtpPort, startTls]);

    expect(screen.getByLabelText('Platform name')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Smtp port')).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText('Smtp use starttls')).toHaveRole('combobox');
    expect(screen.getByText('Configuration')).toBeVisible();
    expect(screen.getByText('Shown in the console header.')).toBeVisible();
  });

  it('warns when the effective value fails its own rule', () => {
    renderForm([setting({ valid: false, validationMessage: 'must be between 1 and 65535' })]);

    expect(screen.getByRole('alert')).toHaveTextContent('must be between 1 and 65535');
  });

  it('keeps Save disabled until something changed, then sends only that (D6)', async () => {
    const onSave = renderForm([platformName, smtpPort]);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Platform name'));
    await userEvent.type(screen.getByLabelText('Platform name'), 'Acme Fit');
    await userEvent.click(save);

    expect(onSave).toHaveBeenCalledWith([{ key: 'general.platform_name', value: 'Acme Fit' }]);
  });

  it('offers Reset to default only on a stored row, and sends null for it', async () => {
    const stored = setting({ value: 'Acme Fit', source: 'Database' });
    const onSave = renderForm([stored, smtpPort]);

    expect(screen.getAllByRole('button', { name: 'Reset to default' })).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'general.platform_name', value: null }]);
  });

  it('shows a sensitive value as the mask, and only sends a typed replacement (D6)', async () => {
    const onSave = renderForm([smtpPassword]);

    expect(screen.getByText(SETTING_MASK)).toBeVisible();
    expect(screen.queryByLabelText('Smtp password')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Replace value' }));
    const input = screen.getByLabelText('Smtp password');
    expect(input).toHaveAttribute('type', 'password');
    await userEvent.clear(input);
    await userEvent.type(input, 'new-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'email.smtp_password', value: 'new-secret' }]);
  });

  it('never sends the mask back, even after Replace value is opened and left alone', async () => {
    renderForm([smtpPassword]);

    await userEvent.click(screen.getByRole('button', { name: 'Replace value' }));

    // The input opens holding the mask; nothing changed, so Save stays disabled.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('opens Replace value empty, so typing without clearing first never appends to the mask', async () => {
    const onSave = renderForm([smtpPassword]);

    await userEvent.click(screen.getByRole('button', { name: 'Replace value' }));
    const input = screen.getByLabelText('Smtp password');

    // Deliberately no userEvent.clear(): the field must already be empty, not holding "••••".
    expect(input).toHaveValue('');
    await userEvent.type(input, 'new-secret');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'email.smtp_password', value: 'new-secret' }]);
  });

  it('sends a Bool as the API’s lowercase word', async () => {
    const onSave = renderForm([startTls]);

    await userEvent.click(screen.getByLabelText('Smtp use starttls'));
    await userEvent.click(screen.getByRole('option', { name: 'On' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith([{ key: 'email.smtp_use_starttls', value: 'true' }]);
  });

  it('blocks a non-integer Int before it becomes a round trip', async () => {
    const onSave = renderForm([smtpPort]);

    // jsdom lets a number input hold "2.5"; the API would refuse it as not an integer.
    await userEvent.clear(screen.getByLabelText('Smtp port'));
    await userEvent.type(screen.getByLabelText('Smtp port'), '2.5');

    expect(screen.getByText('Enter a whole number.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is read-only without settings.manage — same rows, no controls (D9)', () => {
    renderForm([platformName, smtpPassword], false);

    expect(screen.getByText('GymOS')).toBeVisible();
    expect(screen.getByText(SETTING_MASK)).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
