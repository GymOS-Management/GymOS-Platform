import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from '@/lib/feedback/toast-api-error';
import { ApiError } from '@/lib/api/problems';

describe('apiErrorMessage', () => {
  it('uses the ApiError message, which problems.ts has already made human', () => {
    const error = new ApiError(404, 'gyms.not_found', undefined, false);

    expect(apiErrorMessage(error)).toBe('That gym no longer exists.');
  });

  it('falls back for anything that is not an ApiError', () => {
    expect(apiErrorMessage(new TypeError('fetch failed'))).toBe('Something went wrong.');
    expect(apiErrorMessage('a string')).toBe('Something went wrong.');
    expect(apiErrorMessage(undefined)).toBe('Something went wrong.');
  });

  /**
   * The two auth screens (/login, /set-password) pass their own fallback rather than take the
   * generic one — "Please try again." is the useful advice exactly when sign-in or account
   * activation fails. A regression that dropped the second parameter, or ignored it, would silently
   * flatten their copy back to the generic sentence.
   */
  it('honours a caller-supplied fallback instead of the generic sentence', () => {
    expect(
      apiErrorMessage(new TypeError('fetch failed'), 'Something went wrong. Please try again.'),
    ).toBe('Something went wrong. Please try again.');
  });

  it('still uses the ApiError message even when a custom fallback is supplied', () => {
    const error = new ApiError(404, 'gyms.not_found', undefined, false);

    expect(apiErrorMessage(error, 'Something went wrong. Please try again.')).toBe(
      'That gym no longer exists.',
    );
  });
});
