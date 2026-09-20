'use client';

import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { SettingSourceBadge } from '@/features/settings/setting-source-badge';
import { settingsDiff, type SettingsDraft } from '@/lib/settings/diff';
import { settingBool, settingLabel, validateSettingValue } from '@/lib/settings/values';
import { SETTING_MASK, type SettingValueWrite, type SettingView } from '@/types/api';

/**
 * One category's rows, rendered from the catalogue by type (F5-DESIGN D5), saved as a diff (D6).
 *
 * The draft holds only the keys the operator touched; `null` is a reset. Save is disabled until the
 * diff is non-empty, so an unchanged form never reaches `PUT /settings` — which would otherwise
 * create a Database-sourced row for every key it received. Without `settings.manage` the whole form
 * is read-only: no inputs, no buttons, the same rows (D9).
 *
 * The parent keys this component by `settingsFingerprint(settings)`, so a successful save remounts
 * it with an empty draft.
 */
export function SettingsCategoryForm({
  settings,
  canManage,
  busy,
  error,
  onSave,
}: {
  settings: readonly SettingView[];
  canManage: boolean;
  busy: boolean;
  error: unknown;
  onSave: (changes: SettingValueWrite[]) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraft>({});
  // Sensitive rows whose mask the operator chose to replace with an input.
  const [replacing, setReplacing] = useState<ReadonlySet<string>>(new Set());

  const changes = useMemo(() => settingsDiff(settings, draft), [settings, draft]);

  const problems = settings
    .map((view) => {
      const value = draft[view.key];
      return typeof value === 'string' ? validateSettingValue(view, value) : null;
    })
    .filter((message): message is string => message !== null);

  const set = (key: string, value: string | null) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (changes.length > 0 && problems.length === 0) {
      onSave(changes);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {settings.map((view) => {
        const label = settingLabel(view.key);
        const pending = draft[view.key];
        const isReset = pending === null;
        const shown = typeof pending === 'string' ? pending : (view.value ?? '');
        const masked =
          view.isSensitive && view.value === SETTING_MASK && !replacing.has(view.key) && !isReset;
        const clientProblem =
          typeof pending === 'string' ? validateSettingValue(view, pending) : null;

        return (
          <div key={view.key} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor={view.key}>{label}</Label>
              <code className="text-muted-foreground text-xs">{view.key}</code>
              <SettingSourceBadge source={isReset ? 'Default' : view.source} />
            </div>
            <p className="text-muted-foreground text-sm">{view.description}</p>

            {!view.valid && view.validationMessage && (
              // The effective value breaks its own rule — a configuration or row nobody validated on
              // the way in. Said plainly rather than styled as a hint.
              <p role="alert" className="text-destructive flex items-center gap-1 text-sm">
                <TriangleAlert className="size-4" aria-hidden />
                {view.validationMessage}
              </p>
            )}

            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                {masked ? (
                  <>
                    <span className="font-mono text-sm" aria-label={`${label} is set`}>
                      {SETTING_MASK}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReplacing((current) => new Set(current).add(view.key))}
                    >
                      Replace value
                    </Button>
                  </>
                ) : isReset ? (
                  <span className="text-muted-foreground text-sm">
                    Will return to its default on save.
                  </span>
                ) : view.valueType === 'Bool' ? (
                  <Select
                    value={settingBool(shown) ? 'true' : 'false'}
                    onValueChange={(value) => set(view.key, value)}
                  >
                    <SelectTrigger id={view.key} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">On</SelectItem>
                      <SelectItem value="false">Off</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={view.key}
                    type={
                      view.valueType === 'Int' ? 'number' : view.isSensitive ? 'password' : 'text'
                    }
                    inputMode={view.valueType === 'Int' ? 'numeric' : undefined}
                    value={shown}
                    autoComplete="off"
                    aria-invalid={clientProblem ? true : undefined}
                    aria-describedby={clientProblem ? `${view.key}-error` : undefined}
                    onChange={(event) => set(view.key, event.target.value)}
                    className="sm:max-w-md"
                  />
                )}

                {view.source === 'Database' && !isReset && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set(view.key, null)}
                  >
                    Reset to default
                  </Button>
                )}
                {isReset && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraft(({ [view.key]: _, ...rest }) => rest)}
                  >
                    Keep current value
                  </Button>
                )}
              </div>
            ) : (
              <p className="font-mono text-sm">
                {view.value ?? <span className="text-muted-foreground">not set</span>}
              </p>
            )}

            {clientProblem && (
              <p id={`${view.key}-error`} role="alert" className="text-destructive text-sm">
                {clientProblem}
              </p>
            )}
          </div>
        );
      })}

      {canManage && (
        <>
          <ApiErrorText error={error} />
          <Button
            type="submit"
            loading={busy}
            disabled={changes.length === 0 || problems.length > 0}
          >
            Save
          </Button>
        </>
      )}
    </form>
  );
}
