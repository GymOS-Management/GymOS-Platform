'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog, DestructiveConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { maintenanceState } from '@/lib/settings/maintenance';
import type { SettingView } from '@/types/api';

/**
 * Turning the platform off for everyone but a SuperAdmin (F5-DESIGN D7).
 *
 * Enabling is type-to-confirm — the operator types `maintenance`, and *what they typed* is sent as
 * `X-Confirm-Action` for the API to judge (AD-6). A mis-click must not be able to close the whole
 * platform. Disabling is a plain confirmation: the mistake it guards against is smaller. Neither
 * button exists without `settings.manage` (D9).
 *
 * The message textarea renders **inside** `DestructiveConfirmDialog` rather than beside it in the
 * card: that dialog is a Radix modal, which makes everything outside it inert while open — a field
 * placed in the card could never be typed into.
 */
export function MaintenanceSection({
  settings,
  canManage,
  busy,
  errorMessage,
  onEnable,
  onDisable,
  onEnableDialogClose,
}: {
  settings: readonly SettingView[];
  canManage: boolean;
  busy: boolean;
  errorMessage: string | null;
  onEnable: (typed: string, message: string) => void;
  onDisable: () => void;
  /**
   * Called when the enable dialog closes, so a stale refusal ("That did not match.") does not
   * reappear next time it opens — it belongs to the attempt that failed, not the next one.
   */
  onEnableDialogClose?: () => void;
}) {
  const state = maintenanceState(settings);
  const [dialog, setDialog] = useState<'enable' | 'disable' | null>(null);
  const [message, setMessage] = useState(state.message);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Maintenance mode</CardTitle>
        <CardDescription>
          While on, every request except health, sign-in and SuperAdmins is refused with the message
          below. Changes here are recorded in the audit log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <span className="font-medium">{state.enabled ? 'On' : 'Off'}</span>
          {state.enabled && (
            <span className="text-muted-foreground"> — refused callers see: “{state.message}”</span>
          )}
        </p>

        {canManage &&
          (state.enabled ? (
            <Button variant="outline" onClick={() => setDialog('disable')}>
              Disable maintenance mode
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setDialog('enable')}>
              Enable maintenance mode
            </Button>
          ))}
      </CardContent>

      <DestructiveConfirmDialog
        open={dialog === 'enable'}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            onEnableDialogClose?.();
          }
        }}
        title="Enable maintenance mode?"
        description="Everyone without settings.manage is refused on their next request until you disable it."
        expectedHint="Type maintenance to confirm"
        confirmLabel="Enable maintenance mode"
        busy={busy}
        errorMessage={errorMessage}
        onConfirm={(typed) => onEnable(typed, message)}
      >
        <div className="space-y-2">
          <Label htmlFor="maintenance-message">Message shown to refused callers</Label>
          <Textarea
            id="maintenance-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={state.message}
          />
        </div>
      </DestructiveConfirmDialog>

      <ConfirmDialog
        open={dialog === 'disable'}
        onOpenChange={(open) => !open && setDialog(null)}
        title="Disable maintenance mode?"
        description="The platform reopens to every caller immediately."
        confirmLabel="Disable"
        busy={busy}
        onConfirm={onDisable}
      />
    </Card>
  );
}
