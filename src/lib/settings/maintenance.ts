import { settingBool } from '@/lib/settings/values';
import type { SettingView } from '@/types/api';

/**
 * The two Maintenance keys, read from the category's views (Settings.md §1).
 *
 * A pure rule (F5-DESIGN D10), so both feeds that need it — the section that manages maintenance
 * mode and the banner that only polls it — read the same interpretation of `maintenance.enabled`
 * and `maintenance.message` without either importing a `'use client'` component file.
 */
export function maintenanceState(settings: readonly SettingView[]): {
  enabled: boolean;
  message: string;
} {
  const enabled = settings.find((view) => view.key === 'maintenance.enabled');
  const message = settings.find((view) => view.key === 'maintenance.message');

  return { enabled: settingBool(enabled?.value), message: message?.value ?? '' };
}
