'use client';

import type { FieldError, FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { Label } from '@/components/ui/label';
import { ApiError, FIELD_FOR_CODE } from '@/lib/api/problems';

/**
 * Label + control + error, wired for screen readers: the error is announced, and the control points at
 * it via `aria-describedby` so assistive tech reads the explanation with the field.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: FieldError;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
    </div>
  );
}

/**
 * Routes an API failure to the form field its code names (F1-DESIGN.md D8), so
 * `gyms.slug_invalid` lands under the slug input instead of in a banner the operator has already
 * scrolled past. Returns false when the code maps to no field on this form — the caller then shows it
 * as a toast, so nothing is swallowed.
 */
export function applyProblemToForm<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): boolean {
  if (!(error instanceof ApiError) || !error.code) {
    return false;
  }

  const field = FIELD_FOR_CODE[error.code];

  if (!field || !fields.includes(field as Path<T>)) {
    return false;
  }

  setError(field as Path<T>, { type: 'server', message: error.message });
  return true;
}
