'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { ConfirmDialog } from '@/components/feedback/confirm-dialogs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/forms/form-field';
import type { FeatureListItem, UpdateFeatureRequest } from '@/types/api';

/**
 * `features.name_invalid` is the server's backstop; 120 is enforced here so the operator never has to
 * round-trip to learn it.
 */
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(120, 'Keep the name to 120 characters or fewer.'),
  description: z.string().trim(),
  category: z.string().trim(),
  defaultEnabled: z.boolean(),
  isPremium: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** An empty string is not the same as "leave it as it was" — it becomes `null`, same as the plan form. */
function orNull(value: string): string | null {
  return value === '' ? null : value;
}

/**
 * Catalogue editing. Copy (name, description, category, premium) saves straight away. Flipping
 * `defaultEnabled` does not — it is the widest-blast-radius write in the module (D4), re-answering the
 * feature for every gym with neither an override nor a plan opinion of its own, so it is confirmed
 * first rather than sent on the same click.
 */
export function FeatureEditForm({
  feature,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  feature: FeatureListItem;
  busy: boolean;
  error: unknown;
  onSubmit: (body: UpdateFeatureRequest) => void;
  onCancel: () => void;
}) {
  // Holds the body while the default-flip confirmation is open; null the rest of the time, including
  // once the operator confirms or cancels.
  const [pendingFlip, setPendingFlip] = useState<UpdateFeatureRequest | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: feature.name,
      description: feature.description,
      category: feature.category,
      defaultEnabled: feature.defaultEnabled,
      isPremium: feature.isPremium,
    },
  });

  const submit = handleSubmit((values) => {
    const body: UpdateFeatureRequest = {
      name: values.name,
      description: orNull(values.description.trim()),
      category: orNull(values.category.trim()),
      defaultEnabled: values.defaultEnabled,
      isPremium: values.isPremium,
    };

    if (body.defaultEnabled !== feature.defaultEnabled) {
      setPendingFlip(body);
      return;
    }

    onSubmit(body);
  });

  const confirmFlip = () => {
    if (!pendingFlip) {
      return;
    }
    onSubmit(pendingFlip);
    setPendingFlip(null);
  };

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-6">
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">Key</p>
          {/* Immutable — absent from UpdateFeatureRequest by design (FeatureContracts.cs), so it has
              no input, only this read-only rendering. */}
          <code className="block text-sm">{feature.key}</code>
        </div>

        <FormField id="name" label="Name" error={errors.name}>
          <Input
            id="name"
            maxLength={120}
            aria-invalid={errors.name ? true : undefined}
            {...register('name')}
          />
        </FormField>

        <FormField id="description" label="Description" error={errors.description}>
          <Textarea
            id="description"
            aria-invalid={errors.description ? true : undefined}
            {...register('description')}
          />
        </FormField>

        <FormField id="category" label="Category" error={errors.category}>
          <Input
            id="category"
            aria-invalid={errors.category ? true : undefined}
            {...register('category')}
          />
        </FormField>

        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            id="defaultEnabled"
            {...register('defaultEnabled')}
          />
          Enabled by default
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
          <input
            type="checkbox"
            className="accent-primary h-4 w-4"
            id="isPremium"
            {...register('isPremium')}
          />
          Premium
        </label>

        <ApiErrorText error={error} />

        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={pendingFlip !== null}
        onOpenChange={(open) => !open && setPendingFlip(null)}
        title={`Change ${feature.name}’s default?`}
        description={`Flipping the default re-answers ${feature.name} for every gym with neither an override nor a plan opinion of its own.`}
        confirmLabel="Change default"
        busy={busy}
        onConfirm={confirmFlip}
      >
        <div className="space-y-2 text-sm">
          {(feature.adoptionCount !== null || feature.overrideCount !== null) && (
            <p className="text-muted-foreground">
              {feature.adoptionCount !== null && (
                <span>{feature.adoptionCount} gyms currently resolve it on. </span>
              )}
              {feature.overrideCount !== null && (
                <span>{feature.overrideCount} gyms hold an override.</span>
              )}
            </p>
          )}
          <p>
            The API cannot tell you exactly how many gyms follow the default — that figure is not
            exposed, and it cannot be worked out from the counts above.
          </p>
        </div>
      </ConfirmDialog>
    </>
  );
}
