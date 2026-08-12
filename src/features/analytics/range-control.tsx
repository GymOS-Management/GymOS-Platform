'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MAX_RANGE_DAYS,
  RANGE_PRESETS,
  explainInvalidRange,
  type DateRange,
} from '@/lib/analytics/range';

/**
 * The date range every analytics screen carries.
 *
 * Clamps to what the API accepts — `from` and `to` are required and the inclusive span may not exceed
 * 366 days — so the common mistakes never become a round trip. **Clamping is not trusting**: the
 * screens still render `analytics.range_invalid` if it comes back, because a URL can be hand-edited
 * and a client that believes its own validation shows a stack trace when someone does (D8).
 */
export function RangeControl({
  range,
  onChange,
  today,
}: {
  range: DateRange;
  onChange: (range: DateRange) => void;
  /** Injected so the presets stay pure and testable rather than reading the clock themselves. */
  today: Date;
}) {
  const problem = explainInvalidRange(range);

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_PRESETS.map((preset) => {
          const candidate = preset.build(today);
          const selected = candidate.from === range.from && candidate.to === range.to;

          return (
            <Button
              key={preset.id}
              type="button"
              variant={selected ? 'primary' : 'outline'}
              size="sm"
              aria-pressed={selected}
              onClick={() => onChange(candidate)}
            >
              {preset.label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only">From</span>
          <Input
            type="date"
            value={range.from}
            max={range.to}
            aria-label="From date"
            className="w-40"
            onChange={(event) => onChange({ ...range, from: event.target.value })}
          />
        </label>
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only">To</span>
          <Input
            type="date"
            value={range.to}
            min={range.from}
            aria-label="To date"
            className="w-40"
            onChange={(event) => onChange({ ...range, to: event.target.value })}
          />
        </label>
      </div>

      {problem ? (
        // Its own id, like the gym form's `#slug-error`: Next renders an always-present, empty
        // `role="alert"` route announcer, so a bare `getByRole('alert')` matches that as well.
        <p id="range-error" role="alert" className="text-destructive text-sm">
          {problem} A range covers at most {MAX_RANGE_DAYS} days.
        </p>
      ) : null}
    </div>
  );
}
