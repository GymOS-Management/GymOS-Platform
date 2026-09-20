import { describe, expect, it } from 'vitest';
import { ApiError, messageFor, parseProblem } from '@/lib/api/problems';

describe('problem-code mapping (D8)', () => {
  it('maps a known code to its sentence regardless of the response prose', () => {
    expect(messageFor('gyms.slug_taken', 'server prose', 409)).toContain('already in use');
  });

  describe('the features.* codes (F4-DESIGN §4)', () => {
    it('maps a missing feature', () => {
      expect(messageFor('features.not_found', 'server prose', 404)).toContain('no longer exists');
    });

    it('maps a missing override reason without repeating the key the server names', () => {
      // The server's own detail names the offending key; the mapped copy must not contradict or
      // duplicate that, so it stays generic and never echoes back the server's prose.
      const message = messageFor(
        'features.override_reason_required',
        "Key 'pos' requires a reason.",
        400,
      );

      expect(message).toMatch(/reason/i);
      expect(message).not.toBe("Key 'pos' requires a reason.");
    });

    it('maps the three codes that are defence rather than a reachable path', () => {
      expect(messageFor('features.unknown_key', 'server prose', 400)).toMatch(/catalogue/i);
      expect(messageFor('features.duplicate_key', 'server prose', 400)).toMatch(/twice/i);
      expect(messageFor('features.key_invalid', 'server prose', 400)).toMatch(/snake_case/i);
    });
  });

  it('falls back to the response detail for a code it has never heard of', () => {
    // A new backend code must degrade to "wordier", never to "unexplained".
    expect(messageFor('gyms.some_future_code', 'The future explained here.', 400)).toBe(
      'The future explained here.',
    );
  });

  it('never surfaces a bare status code', () => {
    expect(messageFor(undefined, undefined, 500)).not.toMatch(/500/);
    expect(messageFor(undefined, undefined, 0)).toMatch(/could not be reached/i);
  });

  it('parses a problem document into a typed error', async () => {
    const response = new Response(
      JSON.stringify({ code: 'concurrency.conflict', detail: 'stale', retryable: false }),
      { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
    );

    const error = await parseProblem(response);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.isConflict).toBe(true);
    expect(error.retryable).toBe(false);
  });

  it('survives a non-JSON body — a proxy error page is not allowed to crash error handling', async () => {
    const response = new Response('<html>Bad Gateway</html>', { status: 502 });

    const error = await parseProblem(response);

    expect(error.status).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.message).toMatch(/something went wrong/i);
  });
});

describe('maintenance and rate-limit metadata (F5 D7)', () => {
  it('recognises the maintenance short-circuit by code and status, not by title', async () => {
    const response = new Response(
      JSON.stringify({
        type: 'settings.maintenance',
        title: 'Maintenance in progress',
        detail: 'Back at 03:00 UTC.',
        code: 'settings.maintenance',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '300' },
      },
    );

    const error = await parseProblem(response);

    expect(error.isMaintenance).toBe(true);
    expect(error.retryAfterSeconds).toBe(300);
    // No mapped sentence for this code on purpose: `detail` IS the operator's own message.
    expect(error.message).toBe('Back at 03:00 UTC.');
  });

  it('a 503 without the code is an outage, not maintenance', async () => {
    const response = new Response('<html>bad gateway</html>', { status: 503 });

    const error = await parseProblem(response);

    expect(error.isMaintenance).toBe(false);
    expect(error.retryAfterSeconds).toBeNull();
  });

  it('ignores a Retry-After that is not a whole number of seconds', async () => {
    // RFC 7231 also allows an HTTP-date; this backend never sends one, and a date parsed as a
    // number would be NaN minutes on screen.
    const response = new Response(JSON.stringify({ code: 'security.rate_limited' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After': 'Wed, 21 Oct 2026 07:28:00 GMT',
      },
    });

    expect((await parseProblem(response)).retryAfterSeconds).toBeNull();
  });
});
