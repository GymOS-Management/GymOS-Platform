import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveBlob } from '@/lib/utils/download';

/**
 * `saveBlob` is the one mechanism that works for a body fetched with a bearer token (F5-DESIGN D8):
 * an `<a href>` straight to the API would carry no `Authorization` header, since the token lives in
 * memory and never in a cookie (F1 D3). These tests are about the DOM choreography around that,
 * not about the fetch itself, which `client.test.ts`'s `api.download` suite already covers.
 */
describe('saveBlob (F5 D8)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    createObjectURL = vi.fn(() => 'blob:fake-url');
    revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('clicks a removed anchor carrying the given filename, then revokes the URL after the timer', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');

    saveBlob(new Blob(['id,created_at_utc\r\n']), 'audit-logs-20260821-20260920.csv');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const anchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('audit-logs-20260821-20260920.csv');
    expect(anchor.href).toBe('blob:fake-url');
    expect(removeSpy).toHaveBeenCalledTimes(1);

    // Not revoked synchronously — that races the click in some browsers and yields an empty file.
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');

    clickSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
