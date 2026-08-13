/**
 * When a granted exception starts asking to be looked at again.
 *
 * A **display hint, not a rule.** Nothing expires, nothing is withheld, and no request is refused
 * because of this number — the backend has no concept of it. Ninety days matches the goodwill-trial
 * example Features.md uses when explaining that an override, once granted, is permanent until a
 * human remembers it.
 */
export const REVIEW_AFTER_DAYS = 90;

export interface OverrideAge {
  days: number;
  needsReview: boolean;
}

const MS_PER_DAY = 86_400_000;

export function overrideAge(setAtUtc: string, now: Date): OverrideAge {
  const elapsed = now.getTime() - Date.parse(setAtUtc);
  // Clamped: a browser clock behind the host's would otherwise render "granted -1 days ago", which
  // reads as a bug in the data rather than as a clock disagreement.
  const days = Math.max(0, Math.floor(elapsed / MS_PER_DAY));

  return { days, needsReview: days >= REVIEW_AFTER_DAYS };
}
