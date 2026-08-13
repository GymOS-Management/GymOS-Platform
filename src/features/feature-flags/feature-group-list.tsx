import * as React from 'react';

/**
 * Groups features under their category heading, in first-seen order.
 *
 * `Category` is a display grouping and nothing branches on it (Features.md) — which is exactly why
 * this component reads it as an opaque string rather than switching on a known set. A category
 * added to the catalogue tomorrow renders without a change here.
 */
export function FeatureGroupList<T>({
  items,
  categoryOf,
  children,
}: {
  items: readonly T[];
  categoryOf: (item: T) => string;
  children: (item: T) => React.ReactNode;
}) {
  const groups: { category: string; items: T[] }[] = [];

  for (const item of items) {
    const category = categoryOf(item);
    const existing = groups.find((group) => group.category === category);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ category, items: [item] });
    }
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.category} aria-label={group.category}>
          <h3 className="text-muted-foreground mb-2 text-sm font-medium">{group.category}</h3>
          <div className="space-y-2">{group.items.map((item) => children(item))}</div>
        </section>
      ))}
    </div>
  );
}
