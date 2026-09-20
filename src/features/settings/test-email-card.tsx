'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import type { SmtpConnectionTestResult } from '@/types/api';

/**
 * Connects, authenticates if a username is set, NOOPs, disconnects — sends nothing (Settings.md §6,
 * ADR-53). A refused login is still a 200 with `ok: false` and the stage it reached; only a disabled
 * sender is a 400 (`settings.email_disabled`), shown as the API's own sentence.
 */
export function TestEmailCard({
  canManage,
  result,
  busy,
  error,
  onTest,
}: {
  canManage: boolean;
  result: SmtpConnectionTestResult | null;
  busy: boolean;
  error: unknown;
  onTest: () => void;
}) {
  if (!canManage) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">SMTP connection</CardTitle>
        <CardDescription>
          Opens the same round trips a real send would and sends nothing. Uses the saved values, so
          save first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button type="button" variant="outline" loading={busy} onClick={onTest}>
          Test connection
        </Button>
        <ApiErrorText error={error} />
        {result && (
          <div role="status" className="rounded-md border p-3 text-sm">
            {result.ok ? (
              <>
                <p className="font-medium">Connected.</p>
                {result.server && (
                  <p className="text-muted-foreground font-mono text-xs break-all">
                    {result.server}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-medium">Failed at the {result.stage ?? 'unknown'} stage.</p>
                {result.error && <p className="text-muted-foreground">{result.error}</p>}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
