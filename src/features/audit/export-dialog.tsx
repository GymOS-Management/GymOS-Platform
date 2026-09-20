'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import {
  defaultExportRange,
  explainInvalidExportRange,
  type DateRange,
} from '@/lib/settings/export';

/**
 * The audit trail as a file (F5-DESIGN D8).
 *
 * The range defaults to the last 30 days and is checked here against the API's own rule — inclusive,
 * `from ≤ to`, at most 366 days — so the common mistakes never become a round trip. Checking is not
 * trusting: a refusal from the API still renders below the fields. The dialog says plainly that the
 * export is itself an audit entry (`audit.exported`), because personal data leaving the system is
 * exactly the action the trail exists to record.
 */
export function ExportDialog({
  open,
  onOpenChange,
  action,
  today,
  busy,
  error,
  onExport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The list's current action-prefix filter, carried into the export unchanged. */
  action: string;
  /** Injected so the default range is testable against a fixed day. */
  today: Date;
  busy: boolean;
  error: unknown;
  onExport: (range: DateRange) => void;
}) {
  const [range, setRange] = useState<DateRange>(() => defaultExportRange(today));
  const problem = explainInvalidExportRange(range);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export audit log as CSV</DialogTitle>
          <DialogDescription>
            Nine columns per entry, oldest first; before/after values are not included. The export
            is recorded in the audit log with its filter and row count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              value={range.from}
              max={range.to}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              value={range.to}
              min={range.from}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </div>
        </div>

        <p className="text-muted-foreground text-sm">
          {action ? (
            <>
              Filtered to actions starting <code className="font-mono">{action}</code>.
            </>
          ) : (
            'All actions.'
          )}
        </p>

        {problem && (
          <p id="export-range-error" role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <ApiErrorText error={error} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={problem !== null} loading={busy} onClick={() => onExport(range)}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
