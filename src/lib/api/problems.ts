import type { ProblemDetails } from '@/types/api';

/**
 * The API's failure vocabulary, turned into sentences an operator can act on.
 *
 * Every failure is RFC 7807 carrying a stable machine `code` in an extension member. **Branch on the
 * code, never on `title` or on the status alone** — titles are prose that may be reworded, and one
 * status covers many causes (409 is a taken slug, a claimed domain, a stale version, and a wrong
 * lifecycle state, which are four different things to say to a person).
 *
 * A code with no entry here falls back to the response's own `detail`, which the API writes for humans.
 * So an unmapped code degrades to "wordier than ideal", never to "unexplained".
 */
const MESSAGES: Record<string, string> = {
  // Authentication
  'auth.invalid_credentials': 'That email and password combination was not recognised.',
  'auth.account_suspended': 'This account is suspended. Another administrator must reactivate it.',
  'auth.session_expired': 'Your session has expired. Please sign in again.',
  'auth.password_too_weak': 'Choose a longer password — at least 12 characters.',
  'auth.current_password_incorrect': 'Your current password was not correct.',

  // Gyms
  'gyms.not_found': 'That gym no longer exists.',
  'gyms.slug_taken':
    'That address is already in use. Addresses are never reused, including by deleted gyms, because members may still have the link.',
  'gyms.custom_domain_taken': 'Another gym has already claimed that domain.',
  'gyms.deleted': 'This gym has been deleted and can no longer be changed.',
  'gyms.not_suspended': 'Only a suspended gym can be reactivated.',
  'gyms.already_suspended': 'This gym is already suspended.',
  'gyms.already_active': 'This gym is already active.',
  'gyms.reason_required':
    'Give a reason for the suspension — it is shown to whoever lifts it later.',
  'gyms.confirmation_required': 'Type the gym’s address to confirm.',
  'gyms.confirmation_mismatch': 'That did not match the gym’s address. Nothing was changed.',
  'gyms.slug_invalid':
    'Use 3–63 characters: lowercase letters, digits, and single hyphens, starting and ending with a letter or digit.',
  'gyms.country_code_invalid': 'Use a two-letter country code, such as CY.',
  'gyms.currency_invalid': 'Use a three-letter currency code, such as EUR.',
  'gyms.timezone_invalid': 'Use an IANA time zone, such as Asia/Nicosia.',
  'gyms.colour_invalid': 'Use a hex colour, such as #1A2B3C.',
  'gyms.custom_domain_invalid': 'That is not a valid domain name.',
  'gyms.owner_email_invalid': 'That is not a valid email address.',

  // Users
  'users.not_found': 'That administrator no longer exists.',
  'users.email_taken': 'An administrator with that email already exists.',
  'users.unknown_role': 'One of the selected roles no longer exists.',
  'users.cannot_suspend_self': 'You cannot suspend your own account.',
  'users.cannot_change_own_roles': 'You cannot change your own roles.',
  'users.last_super_admin':
    'This is the last active SuperAdmin. Promote someone else first, or the platform becomes unadministrable.',
  'users.already_suspended': 'This administrator is already suspended.',
  'users.not_suspended': 'Only a suspended administrator can be reactivated.',
  'users.reason_required': 'Give a reason for the suspension.',

  // Features (F4-DESIGN §4; codes taken from the backend's Features.md "Value rules and stable codes")
  'features.not_found': 'That feature no longer exists.',
  'features.invalid': 'That change was refused by a feature catalogue rule.',
  'features.name_invalid': 'Give the feature a name of no more than 120 characters.',
  // The server's own message names the key that lacks a reason — this sentence deliberately does
  // not repeat or guess at that, so a screen wanting the specific key should read `ApiError.detail`
  // rather than `.message` for this code.
  'features.override_reason_required':
    'Give a reason for the override — it is shown to whoever reviews it later.',
  // The next three are defence, not a path this console can reach: every key it sends comes from the
  // catalogue GET itself, and no endpoint accepts a caller-supplied new key. Mapped anyway, because a
  // code arriving unmapped reads worse than one mapped for a case that cannot occur.
  'features.unknown_key': 'That key is not in this platform’s feature catalogue.',
  'features.duplicate_key': 'That key was given twice in the same request.',
  'features.key_invalid':
    'Feature keys must be lower-case snake_case and no more than 60 characters.',

  // Concurrency (see ApiError.isConflict for how these are surfaced)
  'concurrency.conflict':
    'Someone else changed this while you were editing. Reload to see their version, then reapply your change.',
  'concurrency.version_required':
    'The console failed to send a version with this update. Reload the page and try again.',
  'concurrency.malformed_version':
    'The console sent an invalid version with this update. Reload the page and try again.',
};

/** A failed API call, carrying the parts of the problem document worth acting on. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly detail: string | undefined,
    readonly retryable: boolean,
  ) {
    super(messageFor(code, detail, status));
    this.name = 'ApiError';
  }

  /** A stale write. The caller must re-read; retrying the same version can only fail again. */
  get isConflict(): boolean {
    return this.status === 409 && this.code === 'concurrency.conflict';
  }

  /**
   * The console's own bug, not the operator's: a write that skipped the read, or sent a token the API
   * never issued. Surfaced generically to the user and loudly to the console.
   */
  get isPreconditionDefect(): boolean {
    return (
      this.code === 'concurrency.version_required' || this.code === 'concurrency.malformed_version'
    );
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Rate limited. The API sends `Retry-After`; see `retryAfterSeconds` on the parsed response. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export function messageFor(
  code: string | undefined,
  detail: string | undefined,
  status: number,
): string {
  if (code && MESSAGES[code]) {
    return MESSAGES[code]!;
  }

  if (detail && detail.trim().length > 0) {
    return detail;
  }

  // Last resort: never show a bare status code to an operator.
  if (status === 0) {
    return 'The server could not be reached. Check your connection and try again.';
  }

  return 'Something went wrong. Please try again.';
}

/**
 * Reads a problem document. Tolerant on purpose: a proxy or a crash can return HTML or nothing at all
 * where JSON was expected, and the operator still needs a sentence rather than a parse error.
 */
export async function parseProblem(response: Response): Promise<ApiError> {
  let code: string | undefined;
  let detail: string | undefined;
  let retryable = false;

  try {
    const body = (await response.json()) as ProblemDetails & {
      code?: string;
      retryable?: boolean;
    };
    code = body.code;
    detail = body.detail ?? undefined;
    retryable = body.retryable === true;
  } catch {
    // Not a problem document. The status still tells us something.
  }

  return new ApiError(response.status, code, detail, retryable);
}

/**
 * Field-level codes, mapped to the form field they belong to, so a validation failure lands where the
 * operator is looking instead of in a banner at the top of the page.
 */
export const FIELD_FOR_CODE: Record<string, string> = {
  'gyms.slug_invalid': 'slug',
  'gyms.slug_taken': 'slug',
  'gyms.confirmation_mismatch': 'confirmation',
  'gyms.country_code_invalid': 'countryCode',
  'gyms.currency_invalid': 'currency',
  'gyms.timezone_invalid': 'timeZoneId',
  'gyms.owner_email_invalid': 'ownerEmail',
  'gyms.colour_invalid': 'primaryColour',
  'gyms.custom_domain_invalid': 'customDomain',
  'gyms.custom_domain_taken': 'customDomain',
  'users.email_taken': 'email',
  'gyms.reason_required': 'reason',
  'users.reason_required': 'reason',
  // `FeatureEditForm`'s field is literally `name` (feature-edit-form.tsx); mapped for correctness even
  // though that form does not yet call `applyProblemToForm` — it receives its error as a prop from the
  // page's mutation rather than owning one, so this entry is here for whichever form next validates a
  // feature name against `setError`.
  'features.name_invalid': 'name',
};
