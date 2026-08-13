'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/data/status-badge';
import { EmptyState } from '@/components/data/empty-state';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { BrandingForm } from '@/features/gyms/branding-form';
import { GymForm, type GymFormValues } from '@/features/gyms/gym-form';
import { GymStatusActions } from '@/features/gyms/gym-status-actions';
import { GymFeaturesTab } from '@/features/feature-flags/gym-features-tab';
import { InvoiceTable } from '@/features/invoices/invoice-table';
import { AssignPlanDialog } from '@/features/subscriptions/assign-dialog';
import { HistoryList } from '@/features/subscriptions/history-list';
import { SubscriptionActions } from '@/features/subscriptions/subscription-actions';
import { SubscriptionCard } from '@/features/subscriptions/subscription-card';
import { gyms, invoices, plans, subscriptions } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { toastApiError } from '@/lib/feedback/toast-api-error';
import { usePermission } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/utils/format';
import type { GymDetail, SubscriptionDetail } from '@/types/api';

/**
 * One gym: header with lifecycle actions, then Overview and Branding tabs.
 *
 * The tab strip is where M3–M6 add Subscription, Features, Devices, and Invoices — designed to
 * receive them, not stubbed with empty panels (a tab that always shows nothing teaches operators to
 * stop opening tabs).
 *
 * A deleted gym still renders — deliberately, matching the API: an operator investigating why a
 * tenant stopped working needs to see that it was deleted and when, not a 404.
 */
export default function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = use(params);

  const query = useQuery({
    queryKey: ['gyms', 'detail', gymId],
    queryFn: ({ signal }) => gyms.get(gymId, signal),
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
    return <PageHeader title="Gym unavailable" description={<ApiErrorText error={error} />} />;
  }

  const gym = query.data;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {gym.name}
            <StatusBadge status={gym.status} />
          </span>
        }
        description={
          <>
            <span className="font-mono text-xs">{gym.slug}</span>
            {gym.status === 'Suspended' && gym.suspensionReason && (
              <span className="mt-1 block">Suspended: {gym.suspensionReason}</span>
            )}
            {gym.status === 'Deleted' && (
              <span className="mt-1 block">Deleted {formatDateTime(gym.deletedAtUtc)}.</span>
            )}
          </>
        }
        actions={<GymStatusActions gym={gym} />}
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          {/* `features` is absent (not merely empty) for a caller without `features.read` — M4.1 made
              the block optional on the gym detail response. Keying this on a permission check alone
              would show a gyms.read-only role an empty tab with no explanation; keying it on the
              block's presence tells the honest story instead. */}
          {gym.features != null && <TabsTrigger value="features">Features</TabsTrigger>}
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab gym={gym} />
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>Branding</CardTitle>
            </CardHeader>
            <CardContent>
              {gym.status === 'Deleted' ? (
                <ReadOnlyNotice />
              ) : (
                <BrandingForm key={gym.rowVersion} gym={gym} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionTab gymId={gym.id} />
        </TabsContent>

        {gym.features != null && (
          <TabsContent value="features">
            <FeaturesTab gymId={gym.id} />
          </TabsContent>
        )}

        <TabsContent value="invoices">
          <InvoicesTab gymId={gym.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function OverviewTab({ gym }: { gym: GymDetail }) {
  const queryClient = useQueryClient();
  const canEdit = usePermission('gyms.update') && gym.status !== 'Deleted';

  const update = async (values: GymFormValues) => {
    try {
      await gyms.update(gym.id, {
        name: values.name,
        ownerName: values.ownerName,
        ownerEmail: values.ownerEmail,
        phone: values.phone.trim() || null,
        countryCode: values.countryCode,
        timeZoneId: values.timeZoneId,
        currency: values.currency,
      });

      toast.success('Gym updated.');
      await queryClient.invalidateQueries({ queryKey: ['gyms'] });
    } catch (error) {
      if (error instanceof ApiError && error.isConflict) {
        toast.error(error.message, {
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 10_000,
        });
        return;
      }

      throw error; // GymForm routes field codes; unmapped ones become its toast.
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Owner" value={gym.ownerName} />
            <ReadOnlyField label="Owner email" value={gym.ownerEmail} />
            <ReadOnlyField label="Phone" value={gym.phone ?? '—'} />
            <ReadOnlyField label="Country" value={gym.countryCode} />
            <ReadOnlyField label="Time zone" value={gym.timeZoneId} />
            <ReadOnlyField label="Currency" value={gym.currency} />
            <ReadOnlyField label="Created" value={formatDateTime(gym.createdAtUtc)} />
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Keyed by rowVersion so a successful save (or a reload after 409) resets the form to the
            authoritative state rather than keeping stale defaults. */}
        <GymForm
          key={gym.rowVersion}
          mode="edit"
          initial={gym}
          onSubmit={update}
          submitLabel="Save changes"
        />
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

function ReadOnlyNotice() {
  return (
    <p className="text-muted-foreground text-sm">
      This gym has been deleted; its records are read-only.
    </p>
  );
}

/**
 * The gym's subscription: its current state, the actions its state allows, and its history.
 *
 * Background jobs (renewals, failed collection) move a subscription to `PastDue`/`Expired` with no
 * operator action, so — like the plan detail page — this refetches on window focus rather than only
 * on mount.
 *
 * `subscriptions.get` 404s when the gym has never been assigned a plan; that is not an error to show,
 * it is the "no subscription yet" state, so it renders `EmptyState` with the same `AssignPlanDialog`
 * used for a plan change, only its "no subscription" branch offers "Assign plan".
 */
function SubscriptionTab({ gymId }: { gymId: string }) {
  const queryClient = useQueryClient();
  const canManage = usePermission('subscriptions.manage');

  const subscriptionQuery = useQuery({
    queryKey: ['subscriptions', 'detail', gymId],
    queryFn: ({ signal }) => subscriptions.get(gymId, signal),
    refetchOnWindowFocus: true,
  });

  const pendingPlanId = subscriptionQuery.data?.pendingChange?.planId ?? null;

  // `PendingPlanChangeDetail` (src/types/api.d.ts) carries only `planId`, not a name — resolved here,
  // once, via the plan's own detail rather than guessed at in `SubscriptionCard`.
  const pendingPlanQuery = useQuery({
    queryKey: ['plans', 'detail', pendingPlanId],
    queryFn: ({ signal }) => plans.get(pendingPlanId!, signal),
    enabled: pendingPlanId !== null,
  });

  const applyUpdated = (updated: SubscriptionDetail) => {
    queryClient.setQueryData(['subscriptions', 'detail', gymId], updated);
    void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'history', gymId] });
    // Assigning a plan and converting a trial both issue an invoice synchronously server-side, so
    // this gym's invoice list (and the cross-gym one) is stale the moment this succeeds. `applyUpdated`
    // is the shared success handler for every subscription mutation on this tab, so invalidating here
    // covers assign/convert-trial without having to track which other mutations might one day issue
    // an invoice too.
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const fail = (error: unknown) => {
    toastApiError(error);
  };

  const resume = useMutation({
    mutationFn: () => subscriptions.resume(gymId),
    onSuccess: (updated) => {
      toast.success('Cancellation withdrawn — the subscription was never not-Active.');
      applyUpdated(updated);
    },
    onError: fail,
  });

  const convertTrial = useMutation({
    mutationFn: () => subscriptions.convertTrial(gymId),
    onSuccess: (updated) => {
      toast.success('Trial converted to a paid subscription.');
      applyUpdated(updated);
    },
    onError: fail,
  });

  if (subscriptionQuery.isPending) {
    return <Skeleton className="h-64 w-full" aria-busy="true" />;
  }

  if (subscriptionQuery.isError) {
    const error = subscriptionQuery.error;

    if (error instanceof ApiError && error.isNotFound) {
      return (
        <EmptyState
          icon={CreditCard}
          title="No subscription"
          description="This gym has not been assigned a plan yet."
          action={
            <AssignPlanDialog
              gymId={gymId}
              subscription={null}
              canManage={canManage}
              onAssigned={applyUpdated}
            />
          }
        />
      );
    }

    return <ApiErrorText error={error} />;
  }

  const subscription = subscriptionQuery.data;

  return (
    <div className="space-y-4">
      <SubscriptionCard
        subscription={subscription}
        canManage={canManage}
        pendingPlanName={pendingPlanQuery.data?.name}
        onResume={subscription.cancelAtPeriodEnd ? () => resume.mutate() : undefined}
        resuming={resume.isPending}
        onConvertTrial={
          subscription.status === 'Trialing' ? () => convertTrial.mutate() : undefined
        }
        convertingTrial={convertTrial.isPending}
      />

      <SubscriptionActions
        gymId={gymId}
        subscription={subscription}
        canManage={canManage}
        onChanged={applyUpdated}
      />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <HistoryList gymId={gymId} />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Wraps `GymFeaturesTab` only to read the `features.manage` permission — kept as its own component
 * (rather than calling `usePermission` inline in `GymDetailPage`'s JSX) so the hook is always called
 * whenever this tab renders, never skipped depending on whether the gym detail response carried a
 * `features` block.
 */
function FeaturesTab({ gymId }: { gymId: string }) {
  return <GymFeaturesTab gymId={gymId} canManage={usePermission('features.manage')} />;
}

/**
 * This gym's invoices, via `InvoiceTable` — the same presentational component Task 9 reuses for the
 * cross-gym list.
 *
 * `invoices.listForGym` answers an unknown gym with an empty array rather than a 404 (M3.3/M3.4), so
 * there is no not-found branch here — an empty list is the truthful "no invoices" state either way,
 * which `InvoiceTable`'s own empty message covers.
 *
 * The hourly overdue sweep relabels invoices with no operator action, so — like the Subscription tab —
 * this refetches on window focus rather than only on mount.
 */
function InvoicesTab({ gymId }: { gymId: string }) {
  const router = useRouter();

  const query = useQuery({
    queryKey: ['invoices', 'forGym', gymId],
    queryFn: ({ signal }) => invoices.listForGym(gymId, signal),
    refetchOnWindowFocus: true,
  });

  if (query.isPending) {
    return <Skeleton className="h-64 w-full" aria-busy="true" />;
  }

  if (query.isError) {
    return <ApiErrorText error={query.error} />;
  }

  return (
    <InvoiceTable
      invoices={query.data}
      emptyMessage="No invoices for this gym yet"
      onRowClick={(invoice) => router.push(`/invoices/${invoice.id}`)}
    />
  );
}
