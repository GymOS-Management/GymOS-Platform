'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { GymForm, type GymFormValues } from '@/features/gyms/gym-form';
import { gyms } from '@/lib/api/endpoints';

export default function NewGymPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const provision = async (values: GymFormValues) => {
    const created = await gyms.provision({
      slug: values.slug.trim(),
      name: values.name,
      ownerName: values.ownerName,
      ownerEmail: values.ownerEmail,
      phone: values.phone.trim() || null,
      countryCode: values.countryCode,
      timeZoneId: values.timeZoneId,
      currency: values.currency,
    });

    toast.success(`${created.name} provisioned. Activate it when setup is complete.`);
    await queryClient.invalidateQueries({ queryKey: ['gyms'] });
    router.push(`/gyms/${created.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Provision a gym"
        description="The gym starts in Provisioning — set it up, then activate it to open for business."
      />
      <Card>
        <CardHeader>
          <CardTitle>Gym details</CardTitle>
          <CardDescription>
            The address is permanent and appears in members’ links. Everything else can be changed
            later.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GymForm mode="provision" onSubmit={provision} submitLabel="Provision gym" />
        </CardContent>
      </Card>
    </div>
  );
}
