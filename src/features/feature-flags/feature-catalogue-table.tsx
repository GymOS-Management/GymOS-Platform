import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FeatureGroupList } from '@/features/feature-flags/feature-group-list';
import type { FeatureListItem } from '@/types/api';

/**
 * A count the API did not compute, rendered as nothing.
 *
 * `adoptionCount` and `overrideCount` are null on every write response. Rendering null as `0` would
 * report "no gyms use this" at exactly the moment an operator finished editing it.
 */
function Count({ label, value }: { label: string; value: number | string | null | undefined }) {
  if (value === null || value === undefined) {
    return null;
  }

  return (
    <span className="text-muted-foreground text-sm">
      {label} <span className="text-foreground font-medium">{value}</span>
    </span>
  );
}

export function FeatureCatalogueTable({
  items,
  canManage,
  onEdit,
}: {
  items: readonly FeatureListItem[];
  canManage: boolean;
  onEdit: (feature: FeatureListItem) => void;
}) {
  return (
    <FeatureGroupList items={items} categoryOf={(item) => item.category}>
      {(item) => (
        <div
          key={item.id}
          className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${
            item.isDeclared ? '' : 'border-dashed opacity-70'
          }`}
        >
          <div className="min-w-48 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.name}</span>
              <code className="text-muted-foreground text-xs">{item.key}</code>
              {item.isPremium && <Badge tone="outline">Premium</Badge>}
            </div>
            <p className="text-muted-foreground text-sm">{item.description}</p>
            {!item.isDeclared && (
              // The whole reason M4.1 added `isDeclared`: an orphan left by a rename is otherwise
              // indistinguishable from a live feature, "flagged only in a startup log nobody reads
              // at 2am". It is never deleted, because dropping it would cascade into plan contents
              // and gym overrides.
              <p className="text-destructive mt-1 text-sm">
                No module declares this key any more. It is kept because deleting it would remove
                plan contents and gym overrides that still reference it.
              </p>
            )}
          </div>

          <Badge tone={item.defaultEnabled ? 'success' : 'outline'}>
            Default {item.defaultEnabled ? 'on' : 'off'}
          </Badge>

          <Count label="Adopted by" value={item.adoptionCount} />
          <Count label="Overrides" value={item.overrideCount} />

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              disabled={!item.isDeclared}
              onClick={() => onEdit(item)}
            >
              Edit
            </Button>
          )}
        </div>
      )}
    </FeatureGroupList>
  );
}
