'use client';

import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/data/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import {
  PlanForm,
  type PlanFormValues,
  type UpdatePlanFormValues,
} from '@/features/plans/plan-form';
import { PlanStatusActions } from '@/features/plans/plan-status-actions';
import { PriceEditor } from '@/features/plans/price-editor';
import { plans } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { usePermission } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/utils/format';
import type { PlanDetail } from '@/types/api';

/**
 * One plan: header with lifecycle actions, then Overview and Prices tabs.
 *
 * `code` is the plan's permanent handle (plan-form.tsx). `PlanForm` in `mode="edit"` never renders it —
 * the update request has no field for it at all — so it is shown once, read-only, in the header instead
 * of being hidden entirely: an operator working the plan still needs to see which one they are on.
 *
 * Background jobs (renewals, price changes) move plan state with no action from the operator looking
 * at this screen, so — unlike the console's default — this query re-checks on window focus.
 */
export default function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const queryClient = useQueryClient();
  const canManage = usePermission('billing.manage');

  const query = useQuery({
    queryKey: ['plans', 'detail', planId],
    queryFn: ({ signal }) => plans.get(planId, signal),
    refetchOnWindowFocus: true,
  });

  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    const error = query.error;
    return (
      <PageHeader
        title="Plan unavailable"
        description={error instanceof ApiError ? error.message : 'Something went wrong.'}
      />
    );
  }

  const plan = query.data;

  // Every mutation surface below (status change, price add/remove, the Overview form) gets the plan's
  // full updated state back directly from its own API call — none of them need this query's cache to
  // act. But this page's `plan` (and the client's remembered ETag for `/plans/{planId}`, which
  // `plans.update`'s `precondition: true` relies on) only move on a refetch, so every surface reports
  // its success here rather than patching the cache itself: one path keeps the header, the two tabs,
  // and the next `If-Match` all agreeing on the same rowVersion.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plans'] });

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {plan.name}
            <StatusBadge status={plan.isActive ? 'Active' : 'Inactive'} />
          </span>
        }
        description={
          <>
            <span className="font-mono text-xs">{plan.code}</span>
            {!plan.isPublic && <span className="ml-2">Unlisted</span>}
          </>
        }
        actions={<PlanStatusActions plan={plan} onChanged={refresh} />}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prices">Prices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab plan={plan} onChanged={refresh} />
        </TabsContent>

        <TabsContent value="prices">
          <Card>
            <CardHeader>
              <CardTitle>Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <PriceEditor
                key={plan.rowVersion}
                planId={plan.id}
                rowVersion={plan.rowVersion}
                prices={plan.prices}
                canManage={canManage}
                onChanged={refresh}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * `PlanDetail`'s numeric fields are `number | string` on the wire (AD-12: the generator declares
 * int32/int64 as either). `PlanForm`'s `defaultValues` wants the coerced numeric shape it submits —
 * this is the one place that gap is bridged, once, rather than each field doing it inline.
 */
function toEditFormValues(plan: PlanDetail): UpdatePlanFormValues {
  const asLimit = (value: number | string | null) => (value === null ? null : Number(value));

  return {
    name: plan.name,
    description: plan.description,
    trialDays: Number(plan.trialDays),
    maxMembers: asLimit(plan.maxMembers),
    maxTrainers: asLimit(plan.maxTrainers),
    maxStaff: asLimit(plan.maxStaff),
    storageLimitMb: asLimit(plan.storageLimitMb),
    sortOrder: Number(plan.sortOrder),
    isPublic: plan.isPublic,
  };
}

function OverviewTab({ plan, onChanged }: { plan: PlanDetail; onChanged: () => void }) {
  const canEdit = usePermission('billing.manage');

  const update = async (values: PlanFormValues) => {
    const {
      name,
      description,
      trialDays,
      maxMembers,
      maxTrainers,
      maxStaff,
      storageLimitMb,
      sortOrder,
      isPublic,
    } = values as UpdatePlanFormValues;

    try {
      await plans.update(plan.id, {
        name,
        description,
        trialDays,
        maxMembers,
        maxTrainers,
        maxStaff,
        storageLimitMb,
        sortOrder,
        isPublic,
      });

      toast.success('Plan updated.');
      onChanged();
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        toast.error(error.message, {
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 10_000,
        });
        return;
      }

      throw error; // PlanForm routes field codes; unmapped ones become its toast.
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Created" value={formatDateTime(plan.createdAtUtc)} />
            <ReadOnlyField
              label="Subscribed gyms"
              value={String(plan.subscribedGymCount)}
              hint="Deactivating this plan does not affect gyms already on it."
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Edit plan</CardTitle>
        </CardHeader>
        <CardContent>
          {canEdit ? (
            // Keyed by rowVersion so a successful save (or a reload after 409) resets the form to the
            // authoritative state rather than keeping stale defaults.
            <PlanForm
              key={plan.rowVersion}
              mode="edit"
              defaultValues={toEditFormValues(plan)}
              onSubmit={update}
              submitLabel="Save changes"
            />
          ) : (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadOnlyField label="Name" value={plan.name} />
              <ReadOnlyField label="Trial days" value={String(plan.trialDays)} />
              <ReadOnlyField label="Sort order" value={String(plan.sortOrder)} />
              <ReadOnlyField
                label="Max members"
                value={plan.maxMembers === null ? 'Unlimited' : String(plan.maxMembers)}
              />
              <ReadOnlyField
                label="Max trainers"
                value={plan.maxTrainers === null ? 'Unlimited' : String(plan.maxTrainers)}
              />
              <ReadOnlyField
                label="Max staff"
                value={plan.maxStaff === null ? 'Unlimited' : String(plan.maxStaff)}
              />
              <ReadOnlyField
                label="Storage limit"
                value={plan.storageLimitMb === null ? 'Unlimited' : `${plan.storageLimitMb} MB`}
              />
              <ReadOnlyField label="Visibility" value={plan.isPublic ? 'Public' : 'Unlisted'} />
              <div className="sm:col-span-2">
                <ReadOnlyField label="Description" value={plan.description || '—'} />
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
      {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
