'use client';

import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FormField, applyProblemToForm } from '@/components/forms/form-field';
import { ApiError } from '@/lib/api/problems';

/**
 * One form for creating and editing a plan, the only structural difference being the code — which
 * exists at creation and is absent afterwards, because `code` is the plan's permanent handle — and
 * `isPublic`, which only exists once there is a plan to unlist (a negotiated plan, D6). Activation and
 * deactivation are separate endpoints, not form fields.
 *
 * The four capacity limits are required-but-nullable on the wire: `null` means unlimited, a real and
 * common choice. An empty input must therefore submit `null`, never `0` — a plan with `maxMembers: 0`
 * admits nobody.
 */
const limit = z
  .union([z.literal(''), z.coerce.number().int().min(1)])
  .transform((value) => (value === '' ? null : value))
  .nullable();

const baseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(1000).nullable(),
  trialDays: z.coerce.number().int().min(0).max(365),
  maxMembers: limit,
  maxTrainers: limit,
  maxStaff: limit,
  storageLimitMb: limit,
  sortOrder: z.coerce.number().int().min(0),
});

// Create takes the code; the API has no isPublic on create.
const createSchema = baseSchema.extend({
  // Immutable after creation and upper-case by construction — the plan's permanent handle.
  code: z
    .string()
    .trim()
    .min(1, 'Code is required')
    .max(50)
    .regex(/^[A-Z0-9_]+$/, 'Use upper-case letters, digits and underscores'),
});

// Update cannot change the code and gains visibility. `isActive` and `isPublic` are separate
// questions: inactive means "cannot be newly assigned", unlisted means "assignable but not
// advertised" — a negotiated plan (D6). Activation is a separate endpoint, not a form field.
const updateSchema = baseSchema.extend({ isPublic: z.boolean() });

export type CreatePlanFormValues = z.infer<typeof createSchema>;
export type UpdatePlanFormValues = z.infer<typeof updateSchema>;
export type PlanFormValues = CreatePlanFormValues | UpdatePlanFormValues;

/**
 * The shape bound to the inputs before validation runs. HTML inputs hand back strings, and the
 * `limit` schema's `z.coerce.number()` accepts them; this type exists only so `register` and
 * `defaultValues` have something concrete to agree on; the resolver is what enforces the real
 * contract, and what `onSubmit` actually receives is `PlanFormValues`.
 */
interface PlanFormFields {
  code: string;
  name: string;
  description: string;
  trialDays: number | string;
  maxMembers: number | string;
  maxTrainers: number | string;
  maxStaff: number | string;
  storageLimitMb: number | string;
  sortOrder: number | string;
  isPublic: boolean;
}

const FIELDS = [
  'code',
  'name',
  'description',
  'trialDays',
  'maxMembers',
  'maxTrainers',
  'maxStaff',
  'storageLimitMb',
  'sortOrder',
  'isPublic',
] as const;

function limitDefault(value: number | null | undefined): number | string {
  return value === null || value === undefined ? '' : value;
}

export function PlanForm({
  mode = 'create',
  defaultValues,
  onSubmit,
  submitLabel,
  disabled = false,
}: {
  mode?: 'create' | 'edit';
  defaultValues?: Partial<PlanFormValues>;
  onSubmit: (values: PlanFormValues) => Promise<void>;
  submitLabel: string;
  disabled?: boolean;
}) {
  const schema = mode === 'create' ? createSchema : updateSchema;
  const initial = defaultValues as Partial<CreatePlanFormValues & UpdatePlanFormValues> | undefined;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormFields, unknown, PlanFormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<PlanFormFields, unknown, PlanFormValues>,
    defaultValues: {
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      trialDays: initial?.trialDays ?? 0,
      maxMembers: limitDefault(initial?.maxMembers),
      maxTrainers: limitDefault(initial?.maxTrainers),
      maxStaff: limitDefault(initial?.maxStaff),
      storageLimitMb: limitDefault(initial?.storageLimitMb),
      sortOrder: initial?.sortOrder ?? 0,
      isPublic: initial?.isPublic ?? true,
    },
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

  const busy = isSubmitting || disabled;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === 'create' && (
          <FormField
            id="code"
            label="Code"
            error={errors.code}
            hint="Upper-case letters, digits and underscores. Permanent — it cannot be changed later."
          >
            <Input
              id="code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="PRO"
              aria-invalid={errors.code ? true : undefined}
              {...register('code', { required: 'Choose the plan’s code.' })}
            />
          </FormField>
        )}

        <FormField id="name" label="Name" error={errors.name}>
          <Input
            id="name"
            aria-invalid={errors.name ? true : undefined}
            {...register('name', { required: 'Enter the plan’s name.' })}
          />
        </FormField>

        <FormField
          id="trialDays"
          label="Trial days"
          error={errors.trialDays}
          hint="0 for no trial."
        >
          <Input
            id="trialDays"
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            aria-invalid={errors.trialDays ? true : undefined}
            {...register('trialDays')}
          />
        </FormField>

        <FormField
          id="sortOrder"
          label="Sort order"
          error={errors.sortOrder}
          hint="Lower numbers appear first in the catalogue."
        >
          <Input
            id="sortOrder"
            type="number"
            min={0}
            inputMode="numeric"
            aria-invalid={errors.sortOrder ? true : undefined}
            {...register('sortOrder')}
          />
        </FormField>

        <FormField
          id="maxMembers"
          label="Max members"
          error={errors.maxMembers}
          hint="Leave blank for unlimited."
        >
          <Input
            id="maxMembers"
            type="number"
            min={1}
            inputMode="numeric"
            aria-invalid={errors.maxMembers ? true : undefined}
            {...register('maxMembers')}
          />
        </FormField>

        <FormField
          id="maxTrainers"
          label="Max trainers"
          error={errors.maxTrainers}
          hint="Leave blank for unlimited."
        >
          <Input
            id="maxTrainers"
            type="number"
            min={1}
            inputMode="numeric"
            aria-invalid={errors.maxTrainers ? true : undefined}
            {...register('maxTrainers')}
          />
        </FormField>

        <FormField
          id="maxStaff"
          label="Max staff"
          error={errors.maxStaff}
          hint="Leave blank for unlimited."
        >
          <Input
            id="maxStaff"
            type="number"
            min={1}
            inputMode="numeric"
            aria-invalid={errors.maxStaff ? true : undefined}
            {...register('maxStaff')}
          />
        </FormField>

        <FormField
          id="storageLimitMb"
          label="Storage limit (MB)"
          error={errors.storageLimitMb}
          hint="Leave blank for unlimited."
        >
          <Input
            id="storageLimitMb"
            type="number"
            min={1}
            inputMode="numeric"
            aria-invalid={errors.storageLimitMb ? true : undefined}
            {...register('storageLimitMb')}
          />
        </FormField>

        <div className="sm:col-span-2">
          <FormField
            id="description"
            label="Description"
            error={errors.description}
            hint="Shown to operators assigning this plan."
          >
            <Textarea
              id="description"
              aria-invalid={errors.description ? true : undefined}
              {...register('description')}
            />
          </FormField>
        </div>

        {mode === 'edit' && (
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
            <input
              type="checkbox"
              className="accent-primary h-4 w-4"
              id="isPublic"
              {...register('isPublic')}
            />
            Public — assignable and advertised in the catalogue
          </label>
        )}
      </div>

      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
