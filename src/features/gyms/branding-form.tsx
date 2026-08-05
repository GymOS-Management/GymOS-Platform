'use client';

import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, applyProblemToForm } from '@/components/forms/form-field';
import { gyms } from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/problems';
import type { GymDetail } from '@/types/api';

/**
 * Branding is replaced wholesale, like the API beneath it: the form submits every field, and an
 * emptied field clears the value. Declarative writes are what make two concurrent editors converge on
 * a state one of them chose — the same reasoning as the backend aggregate's Update().
 *
 * The write carries the *gym's* rowVersion (branding shares its ETag), so a stale edit surfaces as the
 * 409 reload path rather than silently overwriting a colleague's logo.
 */
interface BrandingFormValues {
  logoUrl: string;
  faviconUrl: string;
  primaryColour: string;
  secondaryColour: string;
  customDomain: string;
  emailSenderName: string;
}

const FIELDS = [
  'logoUrl',
  'faviconUrl',
  'primaryColour',
  'secondaryColour',
  'customDomain',
  'emailSenderName',
] as const;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function BrandingForm({ gym }: { gym: GymDetail }) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<BrandingFormValues>({
    defaultValues: {
      logoUrl: gym.branding.logoUrl ?? '',
      faviconUrl: gym.branding.faviconUrl ?? '',
      primaryColour: gym.branding.primaryColour ?? '',
      secondaryColour: gym.branding.secondaryColour ?? '',
      customDomain: gym.branding.customDomain ?? '',
      emailSenderName: gym.branding.emailSenderName ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: BrandingFormValues) =>
      gyms.updateBranding(
        gym.id,
        {
          logoUrl: emptyToNull(values.logoUrl),
          faviconUrl: emptyToNull(values.faviconUrl),
          primaryColour: emptyToNull(values.primaryColour),
          secondaryColour: emptyToNull(values.secondaryColour),
          customDomain: emptyToNull(values.customDomain),
          emailSenderName: emptyToNull(values.emailSenderName),
        },
        gym.rowVersion,
      ),
    onSuccess: async () => {
      toast.success('Branding saved.');
      await queryClient.invalidateQueries({ queryKey: ['gyms'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.isConflict) {
        toast.error(error.message, {
          action: { label: 'Reload', onClick: () => window.location.reload() },
          duration: 10_000,
        });
        return;
      }

      if (!applyProblemToForm(error, setError, FIELDS)) {
        toast.error(error instanceof ApiError ? error.message : 'Something went wrong.');
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="logoUrl" label="Logo URL" error={errors.logoUrl} hint="Optional.">
          <Input id="logoUrl" {...register('logoUrl')} />
        </FormField>

        <FormField id="faviconUrl" label="Favicon URL" error={errors.faviconUrl} hint="Optional.">
          <Input id="faviconUrl" {...register('faviconUrl')} />
        </FormField>

        <FormField
          id="primaryColour"
          label="Primary colour"
          error={errors.primaryColour}
          hint="Hex, e.g. #1A2B3C. Empty uses the platform default."
        >
          <div className="flex items-center gap-2">
            <Input
              id="primaryColour"
              className="flex-1"
              placeholder="#1A2B3C"
              aria-invalid={errors.primaryColour ? true : undefined}
              {...register('primaryColour')}
            />
            <ColourSwatch value={gym.branding.primaryColour} />
          </div>
        </FormField>

        <FormField
          id="secondaryColour"
          label="Secondary colour"
          error={errors.secondaryColour}
          hint="Hex. Empty uses the platform default."
        >
          <div className="flex items-center gap-2">
            <Input
              id="secondaryColour"
              className="flex-1"
              placeholder="#FFFFFF"
              aria-invalid={errors.secondaryColour ? true : undefined}
              {...register('secondaryColour')}
            />
            <ColourSwatch value={gym.branding.secondaryColour} />
          </div>
        </FormField>

        <FormField
          id="customDomain"
          label="Custom domain"
          error={errors.customDomain}
          hint="Must be unique across the platform. DNS setup happens separately."
        >
          <Input
            id="customDomain"
            placeholder="acme-gym.com"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.customDomain ? true : undefined}
            {...register('customDomain')}
          />
        </FormField>

        <FormField
          id="emailSenderName"
          label="Email sender name"
          error={errors.emailSenderName}
          hint="The “from” name on member email. The address stays platform-controlled."
        >
          <Input id="emailSenderName" {...register('emailSenderName')} />
        </FormField>
      </div>

      <Button type="submit" loading={save.isPending}>
        Save branding
      </Button>
    </form>
  );
}

/** The stored colour, shown as itself — a hex string is not something humans verify by reading. */
function ColourSwatch({ value }: { value: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <span
      className="h-9 w-9 shrink-0 rounded-md border"
      style={{ backgroundColor: value }}
      title={value}
      aria-label={`Current colour ${value}`}
    />
  );
}
