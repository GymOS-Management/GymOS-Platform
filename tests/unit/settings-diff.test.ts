import { describe, expect, it } from 'vitest';
import { settingsDiff, settingsFingerprint } from '@/lib/settings/diff';
import { SETTING_MASK, type SettingView } from '@/types/api';

function view(overrides: Partial<SettingView> = {}): SettingView {
  return {
    key: 'general.platform_name',
    category: 'General',
    valueType: 'String',
    isSensitive: false,
    description: "The platform's display name.",
    value: 'GymOS',
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
    ...overrides,
  };
}

const name = view();
const port = view({ key: 'email.smtp_port', category: 'Email', valueType: 'Int', value: '1025' });
const tls = view({
  key: 'email.smtp_use_starttls',
  category: 'Email',
  valueType: 'Bool',
  value: 'false',
});
const password = view({
  key: 'email.smtp_password',
  category: 'Email',
  isSensitive: true,
  value: SETTING_MASK,
  source: 'Database',
});

describe('settingsDiff (D6)', () => {
  it('sends only the keys whose value changed', () => {
    // Sending an untouched row would flip its source to Database — a row nobody set, that now
    // shadows configuration forever.
    expect(settingsDiff([name, port], { 'general.platform_name': 'Acme Fit' })).toEqual([
      { key: 'general.platform_name', value: 'Acme Fit' },
    ]);
  });

  it('sends nothing for a draft equal to the current value', () => {
    expect(settingsDiff([name], { 'general.platform_name': 'GymOS' })).toEqual([]);
  });

  it('sends null for a reset — the row is deleted and the key falls through to the layer below', () => {
    const stored = view({ value: 'Acme Fit', source: 'Database' });

    expect(settingsDiff([stored], { 'general.platform_name': null })).toEqual([
      { key: 'general.platform_name', value: null },
    ]);
  });

  it('never sends the mask, even when the draft still holds it', () => {
    // A sensitive row reads as •••• once stored. Echoing that back is "unchanged" to the API, but
    // it should never be on the wire from here: an unchanged row is not sent at all.
    expect(settingsDiff([password], { 'email.smtp_password': SETTING_MASK })).toEqual([]);
  });

  it('sends a replacement secret, and null to clear one', () => {
    expect(settingsDiff([password], { 'email.smtp_password': 'hunter2' })).toEqual([
      { key: 'email.smtp_password', value: 'hunter2' },
    ]);
    expect(settingsDiff([password], { 'email.smtp_password': null })).toEqual([
      { key: 'email.smtp_password', value: null },
    ]);
  });

  it('treats a Bool that parses the same as unchanged, whatever its casing', () => {
    expect(settingsDiff([tls], { 'email.smtp_use_starttls': 'False' })).toEqual([]);
    expect(settingsDiff([tls], { 'email.smtp_use_starttls': 'true' })).toEqual([
      { key: 'email.smtp_use_starttls', value: 'true' },
    ]);
  });

  it("ignores a draft key that is not in this category's views", () => {
    // The API would refuse it (`settings.wrong_category`) and the whole batch with it.
    expect(settingsDiff([name], { 'email.smtp_port': '25' })).toEqual([]);
  });
});

describe('settingsFingerprint', () => {
  it('changes when a value or its source changes, and not otherwise', () => {
    const before = settingsFingerprint([name, port]);

    expect(settingsFingerprint([name, port])).toBe(before);
    expect(settingsFingerprint([view({ value: 'Acme', source: 'Database' }), port])).not.toBe(
      before,
    );
  });
});
