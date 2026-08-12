/**
 * Reading an audit action code as a person would say it.
 *
 * The trail stores machine codes — `gym.updated`, `plan_price.created`, `auth.sign_in_failed`,
 * `invoice.became_overdue` — and the console showed them raw, so every row had to be decoded by the
 * reader. The convention behind them is `subject.verb`, both in snake_case, which is enough structure
 * to turn into a sentence.
 *
 * **Derived, never looked up.** A dictionary of known actions would be wrong the day a module raises
 * a new one — and the trail is exactly the screen where an unfamiliar entry matters most. Anything
 * following the convention reads correctly without this file being touched; anything that does not
 * still renders, just less prettily. That is the same rule `StatusBadge` follows for statuses it has
 * never seen.
 *
 * The raw code is always shown alongside the label rather than replaced by it: it is the stable API,
 * it is what the action filter matches on, and it is what an operator quotes in a bug report.
 */

/** `sign_in_failed` -> `sign in failed`. */
function words(segment: string): string {
  return segment.replace(/_/g, ' ').trim();
}

function sentenceCase(text: string): string {
  return text.length === 0 ? text : `${text[0]!.toUpperCase()}${text.slice(1)}`;
}

/**
 * A readable label for an action code.
 *
 * `gym.updated` -> `Gym updated`; `plan_price.created` -> `Plan price created`;
 * `auth.sign_in_failed` -> `Auth sign in failed`; `invoice.became_overdue` -> `Invoice became
 * overdue`. A code with no dot, or an empty one, is returned as-is rather than mangled.
 */
export function describeAuditAction(action: string): string {
  const trimmed = action.trim();

  if (trimmed === '') {
    return trimmed;
  }

  const separator = trimmed.indexOf('.');

  if (separator === -1) {
    return sentenceCase(words(trimmed));
  }

  const subject = words(trimmed.slice(0, separator));
  const verb = words(trimmed.slice(separator + 1));

  // A trailing dot ("gym.") is what the action *filter* looks like mid-typing; treat it as the
  // subject alone rather than rendering "Gym " with nothing after it.
  return verb === '' ? sentenceCase(subject) : sentenceCase(`${subject} ${verb}`);
}

/**
 * An entity type as a label: `gym_branding` -> `Gym branding`.
 */
export function describeEntityType(entityType: string | null | undefined): string | null {
  if (!entityType || entityType.trim() === '') {
    return null;
  }

  return sentenceCase(words(entityType));
}

/**
 * The leading segment of a GUID — enough to tell two entities apart at a glance, and to spot the
 * rows that belong to the same one, without a column of 36-character ids nobody reads.
 *
 * The full id stays available in the entry's detail, because that is the one an operator pastes into
 * a query.
 */
export function shortId(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }

  const separator = id.indexOf('-');

  return separator === -1 ? id.slice(0, 8) : id.slice(0, separator);
}

/**
 * A captured property name as a label: `ownerEmail` -> `Owner email`, `IsActive` -> `Is active`.
 *
 * The audit interceptor names complex-type members by path (`Price.Amount`), so a dot is kept as a
 * separator rather than flattened away — "Price · Amount" still reads as one nested field.
 */
export function describeFieldName(field: string): string {
  return field
    .split('.')
    .map((part) =>
      sentenceCase(
        part
          // camelCase and PascalCase both split on a lower→upper boundary.
          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
          .replace(/_/g, ' ')
          .toLowerCase(),
      )
        .split(' ')
        // Lower-cased for the lookup: the first word has already been sentence-cased by this point
        // ("Ip address"), so matching the raw word would only ever catch acronyms in later positions.
        .map((word) => ACRONYMS.get(word.toLowerCase()) ?? word)
        .join(' '),
    )
    .join(' · ');
}

/**
 * Words that must not be sentence-cased.
 *
 * Every timestamp in this domain is named `…AtUtc`, so without this the trail's most common field
 * label read "Last login at utc" — which looks like a typo rather than a unit.
 */
const ACRONYMS = new Map([
  ['utc', 'UTC'],
  ['id', 'ID'],
  ['ip', 'IP'],
  ['url', 'URL'],
  ['api', 'API'],
  ['mb', 'MB'],
]);

/**
 * An ISO-8601 instant, strictly — a date and a time, not a bare `2026-08-12` and not any string that
 * happens to start with digits. Deliberately narrow: guessing wrong turns a captured value into a
 * different one, and the whole point of this screen is that the values are exactly what was stored.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isIsoInstant(value: string): boolean {
  return ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}
