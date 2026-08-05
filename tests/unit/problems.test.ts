import { describe, expect, it } from 'vitest';
import { ApiError, messageFor, parseProblem } from '@/lib/api/problems';

describe('problem-code mapping (D8)', () => {
  it('maps a known code to its sentence regardless of the response prose', () => {
    expect(messageFor('gyms.slug_taken', 'server prose', 409)).toContain('already in use');
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
