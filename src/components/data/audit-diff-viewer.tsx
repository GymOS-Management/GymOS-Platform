import { cn } from '@/lib/utils/cn';

/**
 * Before/after view of one audit entry's captured values.
 *
 * The API stores `oldValues`/`newValues` as JSON documents of the *changed* properties only, with
 * sensitive fields already masked at write time (`***REDACTED***`) — so there is nothing here to hide,
 * only to display. Redacted values are styled distinctly so a reader knows masking happened rather
 * than suspecting the value was genuinely three asterisks.
 *
 * Side-by-side from `sm` up; stacked (before above after) on a phone, where two JSON columns would be
 * eight characters wide each.
 */
const REDACTED = '***REDACTED***';

function parseValues(json: string | null | undefined): Record<string, unknown> | null {
  if (!json) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (value === REDACTED) {
    return (
      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs">
        redacted
      </span>
    );
  }

  return <span className="font-mono text-xs break-all">{String(value)}</span>;
}

export function AuditDiffViewer({
  oldValues,
  newValues,
}: {
  oldValues: string | null | undefined;
  newValues: string | null | undefined;
}) {
  const before = parseValues(oldValues);
  const after = parseValues(newValues);

  // Union of keys, so a property that only appears on one side still gets a row.
  const keys = Array.from(
    new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ).sort();

  if (keys.length === 0) {
    return <p className="text-muted-foreground text-sm">No captured values for this entry.</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="bg-muted/50 text-muted-foreground hidden grid-cols-[1fr_1fr_1fr] gap-2 border-b px-3 py-2 text-xs font-medium sm:grid">
        <span>Field</span>
        <span>Before</span>
        <span>After</span>
      </div>
      <ul className="divide-y">
        {keys.map((key) => {
          const changed =
            JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null);

          return (
            <li
              key={key}
              className={cn(
                'grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[1fr_1fr_1fr] sm:gap-2',
                changed && 'bg-amber-50/50 dark:bg-amber-950/20',
              )}
            >
              <span className="text-xs font-medium sm:self-center">{key}</span>
              <div className="pl-2 sm:pl-0">
                <span className="text-muted-foreground mr-1 text-xs sm:hidden">before:</span>
                <ValueCell value={before?.[key]} />
              </div>
              <div className="pl-2 sm:pl-0">
                <span className="text-muted-foreground mr-1 text-xs sm:hidden">after:</span>
                <ValueCell value={after?.[key]} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
