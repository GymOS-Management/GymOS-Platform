'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ToggleLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/data/empty-state';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { FeatureCatalogueTable } from '@/features/feature-flags/feature-catalogue-table';
import { features } from '@/lib/api/endpoints';
import { usePermission } from '@/lib/auth/session';
import type { FeatureListItem } from '@/types/api';

/**
 * The platform-wide feature catalogue: every declared key, grouped by category, with each key's
 * default and adoption. Not paged — the catalogue is seeded and there are twelve keys
 * (`features.list` in `lib/api/endpoints.ts`).
 *
 * Editing opens a form Task 7 builds; until then `onEdit` only tracks which feature was chosen —
 * this page's `editing` state is the seam that form attaches to, not a dialog of its own.
 */
export default function FeaturesPage() {
  const canManage = usePermission('features.manage');
  // Task 7 wires this to the edit form; for now it only records which feature was chosen.
  const [editing, setEditing] = useState<FeatureListItem | null>(null);

  const query = useQuery({
    queryKey: ['features', 'list'],
    queryFn: ({ signal }) => features.list(signal),
  });

  return (
    <>
      <PageHeader
        title="Features"
        description="The platform's feature catalogue — every key a module declares, its default, and how widely it is adopted."
      />

      {query.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError ? (
        <ApiErrorText error={query.error} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={ToggleLeft}
          title="No features yet"
          description="No module has declared a feature key yet."
        />
      ) : (
        <FeatureCatalogueTable items={query.data} canManage={canManage} onEdit={setEditing} />
      )}

      {editing &&
        // Task 7 replaces this with the real edit form/dialog bound to `editing`, clearing it via
        // setEditing(null) on close.
        null}
    </>
  );
}
