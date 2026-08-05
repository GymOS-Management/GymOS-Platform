'use client';

import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, applyProblemToForm } from '@/components/forms/form-field';
import { ApiError } from '@/lib/api/problems';
import type { GymDetail } from '@/types/api';

/**
 * One form for provisioning and editing a gym; the only structural difference is the slug, which
 * exists at creation and is absent afterwards — the API's contract, not a UI choice: a slug is the
 * gym's public address, and the edit request has no field for it at all.
 *
 * Validation strategy: only *presence* is checked client-side. Shape rules (slug grammar, ISO codes)
 * live in the backend's rule objects, and the API returns their codes, which `applyProblemToForm`
 * routes to the right field. Duplicating those rules here would be a second copy that drifts —
 * the operator gets the same message either way, one round-trip later.
 */
export interface GymFormValues {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  phone: string;
  countryCode: string;
  timeZoneId: string;
  currency: string;
}

const FIELDS = [
  'slug',
  'name',
  'ownerName',
  'ownerEmail',
  'phone',
  'countryCode',
  'timeZoneId',
  'currency',
] as const;

export function GymForm({
  mode,
  initial,
  onSubmit,
  submitLabel,
}: {
  mode: 'provision' | 'edit';
  initial?: GymDetail;
  onSubmit: (values: GymFormValues) => Promise<void>;
  submitLabel: string;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GymFormValues>({
    defaultValues: initial
      ? {
          slug: initial.slug,
          name: initial.name,
          ownerName: initial.ownerName,
          ownerEmail: initial.ownerEmail,
          phone: initial.phone ?? '',
          countryCode: initial.countryCode,
          timeZoneId: initial.timeZoneId,
          currency: initial.currency,
        }
      : { countryCode: 'CY', timeZoneId: 'Asia/Nicosia', currency: 'EUR' },
    // Defaults for a new gym mirror the platform's home market. They are visible, editable values in
    // the form — not hidden policy — which is what §2.2's "no defaults hardcoded" is protecting against.
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      if (!applyProblemToForm(error, setError, FIELDS)) {
        toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
      }
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'provision' ? (
          <FormField
            id="slug"
            label="Address (slug)"
            error={errors.slug}
            hint="Lowercase letters, digits, and hyphens. Permanent — it cannot be changed or reused later."
          >
            <Input
              id="slug"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="acme-gym"
              aria-invalid={errors.slug ? true : undefined}
              {...register('slug', { required: 'Choose the gym’s address.' })}
            />
          </FormField>
        ) : (
          <FormField id="slug" label="Address (slug)" hint="Permanent; cannot be changed.">
            <Input id="slug" disabled value={initial?.slug ?? ''} />
          </FormField>
        )}

        <FormField id="name" label="Gym name" error={errors.name}>
          <Input
            id="name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', { required: 'Enter the gym’s name.' })}
          />
        </FormField>

        <FormField id="ownerName" label="Owner name" error={errors.ownerName}>
          <Input
            id="ownerName"
            autoComplete="name"
            aria-invalid={errors.ownerName ? true : undefined}
            {...register('ownerName', { required: 'Enter the owner’s name.' })}
          />
        </FormField>

        <FormField id="ownerEmail" label="Owner email" error={errors.ownerEmail}>
          <Input
            id="ownerEmail"
            type="email"
            autoComplete="email"
            aria-invalid={errors.ownerEmail ? true : undefined}
            {...register('ownerEmail', { required: 'Enter the owner’s email.' })}
          />
        </FormField>

        <FormField id="phone" label="Phone" error={errors.phone} hint="Optional.">
          <Input id="phone" type="tel" autoComplete="tel" {...register('phone')} />
        </FormField>

        <FormField
          id="countryCode"
          label="Country code"
          error={errors.countryCode}
          hint="ISO, e.g. CY."
        >
          <Input
            id="countryCode"
            maxLength={2}
            autoCapitalize="characters"
            aria-invalid={errors.countryCode ? true : undefined}
            {...register('countryCode', { required: 'Enter the country code.' })}
          />
        </FormField>

        <FormField
          id="timeZoneId"
          label="Time zone"
          error={errors.timeZoneId}
          hint="IANA, e.g. Asia/Nicosia."
        >
          <Input
            id="timeZoneId"
            aria-invalid={errors.timeZoneId ? true : undefined}
            {...register('timeZoneId', { required: 'Enter the time zone.' })}
          />
        </FormField>

        <FormField id="currency" label="Currency" error={errors.currency} hint="ISO, e.g. EUR.">
          <Input
            id="currency"
            maxLength={3}
            autoCapitalize="characters"
            aria-invalid={errors.currency ? true : undefined}
            {...register('currency', { required: 'Enter the currency.' })}
          />
        </FormField>
      </div>

      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
