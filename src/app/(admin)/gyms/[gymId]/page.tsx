'use client';

import { use } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/data/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { BrandingForm } from '@/features/gyms/branding-form';
import { GymForm, type GymFormValues } from '@/features/gyms/gym-form';
import { GymStatusActions } from '@/features/gyms/gym-status-actions';
import { gyms } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import { usePermission } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/utils/format';
import type { GymDetail } from '@/types/api';

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
    return (
      <PageHeader
        title="Gym unavailable"
        description={error instanceof ApiError ? error.message : 'Something went wrong.'}
      />
    );
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
