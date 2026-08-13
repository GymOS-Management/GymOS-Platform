import { describe, expect, it } from 'vitest';
import { overrideAge, REVIEW_AFTER_DAYS } from '@/lib/features/override-age';

const now = new Date('2026-08-13T12:00:00Z');

describe('how old a granted exception is', () => {
  it('counts whole days since it was set', () => {
    expect(overrideAge('2026-08-01T12:00:00Z', now).days).toBe(12);
  });

  it('does not ask for review before the threshold', () => {
    const justUnder = new Date(now.getTime() - (REVIEW_AFTER_DAYS - 1) * 86_400_000);

    expect(overrideAge(justUnder.toISOString(), now).needsReview).toBe(false);
  });

  it('asks for review at the threshold and beyond', () => {
    const exactly = new Date(now.getTime() - REVIEW_AFTER_DAYS * 86_400_000);
    const beyond = new Date(now.getTime() - (REVIEW_AFTER_DAYS + 40) * 86_400_000);

    expect(overrideAge(exactly.toISOString(), now).needsReview).toBe(true);
    expect(overrideAge(beyond.toISOString(), now).needsReview).toBe(true);
  });

  it('clamps a future timestamp to zero rather than reporting negative days', () => {
    // A clock skew between host and browser must not render "granted -1 days ago".
    expect(overrideAge('2026-08-14T12:00:00Z', now).days).toBe(0);
  });
});
