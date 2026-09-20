import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/problems';
import { describeSaveFailure } from '@/lib/settings/save-failure';

/**
 * The settings page's 409 decision (Settings.md §5), pulled out of `onError` so it can be exercised
 * without a mutation, a query client or a mocked fetch (F5-DESIGN D10).
 */
describe('describeSaveFailure', () => {
  it('reads a stale-version 409 as a conflict — the draft is honestly lost, not wrong', () => {
    const error = new ApiError(409, 'concurrency.conflict', 'stale', false);
    expect(describeSaveFailure(error)).toBe('conflict');
  });

  it('reads a named-key refusal as inline — the operator’s own draft to fix', () => {
    const error = new ApiError(
      400,
      'settings.invalid_value',
      'email.smtp_port must be an integer',
      false,
    );
    expect(describeSaveFailure(error)).toBe('inline');
  });

  it('does not mistake an unrelated 409 for the settings conflict', () => {
    const error = new ApiError(409, 'gyms.slug_taken', 'taken', false);
    expect(describeSaveFailure(error)).toBe('inline');
  });

  it('treats no error, and a non-ApiError, as inline', () => {
    expect(describeSaveFailure(null)).toBe('inline');
    expect(describeSaveFailure(new Error('boom'))).toBe('inline');
  });
});
