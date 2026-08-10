/**
 * Presentation helpers.
 *
 * Dates arrive as UTC ISO strings and are rendered in the reader's own zone — the operator's question is
 * "when did this happen to me", not "what did the server's clock say". The API stores UTC (AD-40); the
 * browser converts.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** "3 minutes ago" for recency, falling back to an absolute date once that stops being useful. */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }

  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;

  return formatDate(iso);
}

export function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Money, in the reader's locale and the amount's own currency.
 *
 * `Intl.NumberFormat` derives the number of decimals from the currency code, which is the point:
 * JPY has none and KWD has three, and the backend's `Money` rounds to exactly those minor units
 * (AD-42). Hard-coding two would misprint both.
 *
 * The amount is accepted as a string as well as a number because the API's JSON numbers are read as
 * either depending on the schema — the same reason F1's `totalCount` is `number | string`.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || !currency) {
    return '—';
  }

  const value = typeof amount === 'string' ? Number(amount) : amount;

  if (!Number.isFinite(value)) {
    return '—';
  }

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    // An unrecognised code must not blank the screen; show the number and the code as given.
    return `${value} ${currency}`;
  }
}
