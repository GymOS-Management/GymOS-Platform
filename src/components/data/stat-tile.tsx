import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * One headline number with its label.
 *
 * A stat tile rather than a one-bar chart: a single current value has no shape to compare, and
 * drawing it as a bar invites a comparison the reader cannot make.
 *
 * No sparkline yet — `GET /dashboard/summary` returns the present only, and a second request per
 * tile to draw a 30-day trend is not worth it until something needs it (F3-DESIGN §8).
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold sm:text-3xl">{value}</p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
