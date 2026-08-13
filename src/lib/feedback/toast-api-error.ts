import { toast } from 'sonner';
import { ApiError } from '@/lib/api/problems';

/**
 * The sentence to show for a failed request.
 *
 * `ApiError.message` is already the human copy — `problems.ts` maps the stable code to it — so this
 * adds no wording of its own beyond the fallback for a failure that never reached the API at all
 * (a dropped connection, a bug in our own code).
 */
export function apiErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.';
}

/** The same message, as a toast. The overwhelmingly common way this console reports a failure. */
export function toastApiError(error: unknown, title?: string): void {
  const message = apiErrorMessage(error);

  if (title) {
    toast.error(title, { description: message });
    return;
  }

  toast.error(message);
}
