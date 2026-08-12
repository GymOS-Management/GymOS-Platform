import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/**
 * A row of headline numbers as one bordered strip, not as separate cards.
 *
 * Separate cards were tried first and read badly: on a wide monitor each tile stretched to a quarter
 * of the viewport around a one- or two-digit number, so most of every card was empty and the row
 * looked unbalanced. A strip divided by hairlines fills whatever width it is given without the
 * numbers drifting apart, and it also groups the figures that belong together — which is the point,
 * since three of them sum to a fourth.
 *
 * Stacked below `md` with horizontal rules; one row with vertical rules above it. No wrapped middle
 * layout on purpose: a wrapping grid puts a divider on the first cell of the second row, which reads
 * as a stray line.
 */
export function StatStrip({ children }: { children: ReactNode }) {
  return <Card className="grid grid-cols-1 overflow-hidden md:grid-cols-5">{children}</Card>;
}

/**
 * One figure in the strip.
 *
 * Two layouts, because the same one does not suit both: on a phone the label and the value sit on a
 * single line (five stacked cells otherwise cost ~450px of scroll for five short numbers, pushing
 * everything below them off-screen), and from `md` up the label sits above the value as a column in
 * the strip.
 *
 * Every value is weighted identically on purpose. An earlier version dimmed the four breakdown
 * figures slightly to mark the total — the difference was small enough to read as an accident rather
 * than a hierarchy, which is exactly the unevenness the strip replaced. Order carries that meaning
 * instead: the total is first.
 */
export function StatCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-t p-4 first:border-t-0 md:block md:border-t-0 md:border-l md:first:border-l-0">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-2xl font-semibold sm:text-3xl md:mt-1">{value}</p>
    </div>
  );
}
