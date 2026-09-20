import { ApiError } from '@/lib/api/problems';

/**
 * What a failed `PUT /settings` means for the screen (Settings.md §5; F5-DESIGN D6).
 *
 * A 409 means another administrator's write raced this one on the same row version: the operator's
 * draft is stale and honestly lost, so it is a toast plus a reload, never a message beside Save.
 * Everything else — `settings.invalid_value` naming a key, a network failure, and so on — is the
 * operator's own draft to fix, so it stays in the form beside the field they are looking at.
 *
 * A pure decision (F5-DESIGN D10), so the panel's `onError` and the error it hands the form read the
 * same rule instead of two `instanceof` checks drifting apart.
 */
export function describeSaveFailure(error: unknown): 'conflict' | 'inline' {
  return error instanceof ApiError && error.isConflict ? 'conflict' : 'inline';
}
