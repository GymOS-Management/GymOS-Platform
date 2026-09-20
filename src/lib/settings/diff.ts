import { SETTING_MASK, type SettingValueWrite, type SettingView } from '@/types/api';
import { settingBool } from '@/lib/settings/values';

/**
 * What a save sends (F5-DESIGN D6): only the keys that changed, `null` for a reset, and never the
 * mask.
 *
 * **Why not the whole form.** `PUT /settings` upserts a row for every key it receives, and a row's
 * existence is what makes its `source` read `Database` (Settings.md §2). Sending untouched rows
 * would silently convert "the default" into "a value someone set" for every key on the tab, and a
 * later configuration change would then be shadowed by rows nobody meant to create.
 */

/** Key → the operator's value. `null` means "reset to default"; an absent key is untouched. */
export type SettingsDraft = Record<string, string | null>;

function unchanged(view: SettingView, draft: string): boolean {
  if (view.valueType === 'Bool') {
    return settingBool(view.value) === settingBool(draft);
  }

  return (view.value ?? '') === draft;
}

export function settingsDiff(
  original: readonly SettingView[],
  draft: SettingsDraft,
): SettingValueWrite[] {
  const changes: SettingValueWrite[] = [];

  for (const view of original) {
    if (!(view.key in draft)) {
      continue;
    }

    const value = draft[view.key] ?? null;

    if (value === null) {
      changes.push({ key: view.key, value: null });
      continue;
    }

    // The mask means "unchanged" to the API (§4 step 3), and an unchanged row is not sent at all —
    // so it never appears on the wire from this console.
    if (view.isSensitive && value === SETTING_MASK) {
      continue;
    }

    if (unchanged(view, value)) {
      continue;
    }

    changes.push({ key: view.key, value });
  }

  return changes;
}

/**
 * A key for the form component, so a successful save (which replaces the views) remounts it with an
 * empty draft — the pattern F2's price editor and F4's plan card use with `rowVersion`. Settings have
 * no single version, so this stands in for one.
 */
export function settingsFingerprint(settings: readonly SettingView[]): string {
  return settings.map((view) => `${view.key}=${view.value ?? ''}@${view.source}`).join('|');
}
