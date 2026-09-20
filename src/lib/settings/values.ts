import type { SettingView } from '@/types/api';

/**
 * Reading and checking one setting's value by its declared type (F5-DESIGN D5).
 *
 * The catalogue's four types are `String`, `Int`, `Bool`, `Json` (Settings.md §1); the console
 * renders three and treats the fourth — which no declared key uses today — as text.
 */

/** `bool.TryParse` on the server accepts either casing; a row may hold either. */
export function settingBool(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

/**
 * Why this value would be refused, or `null`. Type only: `Min`/`Max` are not part of `SettingView`,
 * so the range stays the API's to state (`settings.invalid_value` names the key and the rule).
 * An empty string is always accepted — it clears the row (§4 step 4).
 */
export function validateSettingValue(view: SettingView, value: string): string | null {
  if (value === '') {
    return null;
  }

  switch (view.valueType) {
    case 'Int':
      return /^-?\d+$/.test(value.trim()) ? null : 'Enter a whole number.';
    case 'Bool':
      return /^(true|false)$/i.test(value.trim()) ? null : 'Choose on or off.';
    default:
      return null;
  }
}

/** `security.lockout_minutes` → `Lockout minutes`. The raw key is shown beside it, unchanged. */
export function settingLabel(key: string): string {
  const separator = key.indexOf('.');
  const tail = separator === -1 ? key : key.slice(separator + 1);
  const words = tail.replace(/_/g, ' ').trim();

  return words.length === 0 ? words : `${words[0]!.toUpperCase()}${words.slice(1)}`;
}
