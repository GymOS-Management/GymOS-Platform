import { describe, expect, it } from 'vitest';
import {
  describeAuditAction,
  describeEntityType,
  describeFieldName,
  isIsoInstant,
  shortId,
} from '@/lib/utils/audit';

/**
 * The formatter is derived from the `subject.verb` convention rather than a lookup table, so these
 * cases are examples of the shape — not a list to extend every time a module raises a new action.
 * The cases that matter most are the ones that must NOT be mangled: an unknown code, a code with no
 * dot, and the partial code the action filter produces while it is being typed.
 */
describe('describeAuditAction', () => {
  it.each([
    ['gym.created', 'Gym created'],
    ['gym.updated', 'Gym updated'],
    ['plan_price.created', 'Plan price created'],
    ['gym_branding.updated', 'Gym branding updated'],
    ['auth.signed_in', 'Auth signed in'],
    ['auth.sign_in_failed', 'Auth sign in failed'],
    ['invoice.became_overdue', 'Invoice became overdue'],
    ['gym_feature.override_cleared', 'Gym feature override cleared'],
  ])('reads %s as "%s"', (code, expected) => {
    expect(describeAuditAction(code)).toBe(expected);
  });

  it('handles an action nobody has seen before, without a dictionary entry', () => {
    // The whole point of deriving rather than looking up: a module added tomorrow reads correctly.
    expect(describeAuditAction('membership.frozen')).toBe('Membership frozen');
  });

  it('does not mangle a code with no verb', () => {
    expect(describeAuditAction('heartbeat')).toBe('Heartbeat');
  });

  it('treats a trailing dot as the subject alone', () => {
    // This is what the action filter looks like mid-typing ("gym."), and it must not render as
    // "Gym " with a dangling space.
    expect(describeAuditAction('gym.')).toBe('Gym');
  });

  it('returns an empty code untouched', () => {
    expect(describeAuditAction('')).toBe('');
    expect(describeAuditAction('   ')).toBe('');
  });
});

describe('describeEntityType', () => {
  it('reads a snake_case type as words', () => {
    expect(describeEntityType('gym_branding')).toBe('Gym branding');
    expect(describeEntityType('user')).toBe('User');
  });

  it('is null when there is no type, so a caller can render its own dash', () => {
    expect(describeEntityType(null)).toBeNull();
    expect(describeEntityType('')).toBeNull();
    expect(describeEntityType('   ')).toBeNull();
  });
});

describe('shortId', () => {
  it('takes the first segment of a GUID', () => {
    expect(shortId('0f8a1b2c-3d4e-5f60-7a8b-9c0d1e2f3a4b')).toBe('0f8a1b2c');
  });

  it('falls back to the first characters when there is no separator', () => {
    expect(shortId('abcdefghijkl')).toBe('abcdefgh');
  });

  it('is null when there is no id', () => {
    expect(shortId(null)).toBeNull();
    expect(shortId(undefined)).toBeNull();
  });
});

describe('describeFieldName', () => {
  it('splits camelCase and PascalCase into words', () => {
    expect(describeFieldName('ownerEmail')).toBe('Owner email');
    expect(describeFieldName('IsActive')).toBe('Is active');
  });

  it('keeps a complex-type path readable as one nested field', () => {
    // The audit interceptor names complex-type members by path so an invoice's `Net.Amount` and
    // `Tax.Amount` stay apart; flattening the dot would merge them in the reader's eye.
    expect(describeFieldName('Price.Amount')).toBe('Price · Amount');
  });

  it('handles snake_case and digits', () => {
    expect(describeFieldName('max_members')).toBe('Max members');
    expect(describeFieldName('address1')).toBe('Address1');
  });

  it('keeps acronyms upper-case', () => {
    // Every timestamp in this domain is named `…AtUtc`, so "Last login at utc" was the single most
    // common label on the screen and read like a typo.
    expect(describeFieldName('lastLoginAtUtc')).toBe('Last login at UTC');
    expect(describeFieldName('ipAddress')).toBe('IP address');
  });
});

describe('isIsoInstant', () => {
  it('recognises the timestamps the trail actually stores', () => {
    expect(isIsoInstant('2026-08-12T09:21:19.1262790+00:00')).toBe(true);
    expect(isIsoInstant('2026-08-12T09:21:19Z')).toBe(true);
  });

  it('refuses anything that is not unambiguously an instant', () => {
    // Narrow on purpose: mis-detecting a captured value would rewrite it on screen, and this view
    // exists to show exactly what was stored.
    expect(isIsoInstant('2026-08-12')).toBe(false);
    expect(isIsoInstant('12 Aug 2026')).toBe(false);
    expect(isIsoInstant('2026-13-45T99:99:99Z')).toBe(false);
    expect(isIsoInstant('gymos-2026-000001')).toBe(false);
    expect(isIsoInstant('')).toBe(false);
  });
});
