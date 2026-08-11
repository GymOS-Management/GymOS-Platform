'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/page-header';
import { PlanForm, type PlanFormValues } from '@/features/plans/plan-form';
import { plans } from '@/lib/api/endpoints';

export default function NewPlanPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const create = async (values: PlanFormValues) => {
    // `code` only exists on the create-mode values; this page always renders `mode="create"`.
    const {
      code,
      name,
      description,
      trialDays,
      maxMembers,
      maxTrainers,
      maxStaff,
      storageLimitMb,
      sortOrder,
    } = values as PlanFormValues & { code: string };

    const created = await plans.create({
      code,
      name,
      description,
      trialDays,
      maxMembers,
      maxTrainers,
      maxStaff,
      storageLimitMb,
      sortOrder,
    });

    toast.success(`${created.name} created. Add prices before assigning it to a gym.`);
    await queryClient.invalidateQueries({ queryKey: ['plans'] });
    router.push(`/plans/${created.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New plan"
        description="The plan starts active and public with no prices — add prices from the plan page."
      />
      <Card>
        <CardHeader>
          <CardTitle>Plan details</CardTitle>
          <CardDescription>
            The code is permanent and identifies the plan in exports and integrations. Limits left
            blank mean unlimited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanForm mode="create" onSubmit={create} submitLabel="Create plan" />
        </CardContent>
      </Card>
    </div>
  );
}
