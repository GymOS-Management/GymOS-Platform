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
});
