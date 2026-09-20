import { describe, expect, it } from 'vitest';
import { settingBool, settingLabel, validateSettingValue } from '@/lib/settings/values';
import type { SettingView } from '@/types/api';

function view(valueType: string, key = 'x.y'): SettingView {
  return {
    key,
    category: 'General',
    valueType,
    isSensitive: false,
    description: '',
    value: null,
    source: 'Default',
    valid: true,
    validationMessage: null,
    updatedBy: null,
    updatedAtUtc: null,
  };
}

describe('settingBool', () => {
  it("reads the API's bool string case-insensitively, and anything else as false", () => {
    // `bool.TryParse` accepts "True" and "true"; a stored row may carry either.
    expect(settingBool('true')).toBe(true);
    expect(settingBool('True')).toBe(true);
    expect(settingBool('false')).toBe(false);
    expect(settingBool(null)).toBe(false);
    expect(settingBool('yes')).toBe(false);
  });
});

describe('validateSettingValue (D5)', () => {
  it("requires a whole number for Int — the range itself is the API's to enforce", () => {
    // Min/Max are not on the wire (SettingView carries no range), so the console checks only the
    // type and lets `settings.invalid_value` name the range.
    expect(validateSettingValue(view('Int'), '25')).toBeNull();
    expect(validateSettingValue(view('Int'), '-3')).toBeNull();
    expect(validateSettingValue(view('Int'), '2.5')).toMatch(/whole number/i);
    expect(validateSettingValue(view('Int'), 'abc')).toMatch(/whole number/i);
  });

  it('requires true or false for Bool', () => {
    expect(validateSettingValue(view('Bool'), 'true')).toBeNull();
    expect(validateSettingValue(view('Bool'), 'maybe')).toMatch(/on or off/i);
  });

  it('accepts an empty string for every type — it clears the row', () => {
    expect(validateSettingValue(view('Int'), '')).toBeNull();
    expect(validateSettingValue(view('Bool'), '')).toBeNull();
  });

  it('accepts anything for String and for a type it does not know', () => {
    expect(validateSettingValue(view('String'), 'anything')).toBeNull();
    expect(validateSettingValue(view('Json'), '{not json')).toBeNull();
  });
});

describe('settingLabel', () => {
  it('drops the category prefix and reads the key as words', () => {
    expect(settingLabel('general.platform_name')).toBe('Platform name');
    expect(settingLabel('security.sign_in_attempts_per_window')).toBe(
      'Sign in attempts per window',
    );
    expect(settingLabel('email.smtp_use_starttls')).toBe('Smtp use starttls');
  });

  it('leaves a key with no dot as it is, sentence-cased', () => {
    expect(settingLabel('platform_name')).toBe('Platform name');
  });
});
