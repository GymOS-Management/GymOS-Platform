import { apiErrorMessage } from '@/lib/feedback/toast-api-error';

/**
 * The same message, rendered in place — for the forms that show a failure beside the field or under
 * the submit button rather than as a toast.
 */
export function ApiErrorText({ error }: { error: unknown }) {
  if (!error) {
    return null;
  }

  return (
    <p role="alert" className="text-destructive text-sm">
      {apiErrorMessage(error)}
    </p>
  );
}
