import { toast } from 'sonner';
import { ApiError } from '@/lib/api/problems';

/**
 * The sentence to show for a failed request.
 *
 * `ApiError.message` is already the human copy — `problems.ts` maps the stable code to it — so this
 * adds no wording of its own beyond the fallback for a failure that never reached the API at all
 * (a dropped connection, a bug in our own code).
 *
 * `fallback` defaults to the generic sentence, but a caller may override it: the two auth screens
 * (`/login`, `/set-password`) pass `'Something went wrong. Please try again.'` deliberately — signing
 * in or activating an account is exactly the situation where "try again" is the useful next step, and
 * that is worth keeping distinct rather than flattened to the generic copy every other screen uses.
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return error instanceof ApiError ? error.message : fallback;
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
