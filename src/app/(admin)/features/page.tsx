'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ToggleLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/data/empty-state';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { FeatureCatalogueTable } from '@/features/feature-flags/feature-catalogue-table';
import { FeatureEditForm } from '@/features/feature-flags/feature-edit-form';
import { features } from '@/lib/api/endpoints';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { usePermission } from '@/lib/auth/session';
import type { FeatureListItem, UpdateFeatureRequest } from '@/types/api';

/**
 * The platform-wide feature catalogue: every declared key, grouped by category, with each key's
 * default and adoption. Not paged — the catalogue is seeded and there are twelve keys
 * (`features.list` in `lib/api/endpoints.ts`).
 *
 * `editing` is both the seam `FeatureCatalogueTable.onEdit` fills and the switch the edit dialog
 * renders from — non-null means the dialog is open, for that feature.
 */
export default function FeaturesPage() {
  const canManage = usePermission('features.manage');
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FeatureListItem | null>(null);

  const query = useQuery({
    queryKey: ['features', 'list'],
    queryFn: ({ signal }) => features.list(signal),
  });

  const save = useMutation({
    mutationFn: ({ feature, body }: { feature: FeatureListItem; body: UpdateFeatureRequest }) =>
      features.update(feature.id, body, feature.rowVersion),
    onSuccess: () => {
      toast.success('Feature updated.');
      setEditing(null);
      // Refetched rather than patched from the response: a write response returns null counts (D11),
      // so writing it into the cache would blank the adoption figures the list just showed.
      void queryClient.invalidateQueries({ queryKey: ['features'] });
    },
    onError: (error) => toastApiError(error),
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <>
              <DialogHeader>
                <DialogTitle>Edit {editing.name}</DialogTitle>
              </DialogHeader>
              <FeatureEditForm
                feature={editing}
                busy={save.isPending}
                error={save.error}
                onSubmit={(body) => save.mutate({ feature: editing, body })}
                onCancel={() => setEditing(null)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
