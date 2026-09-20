import { describe, expect, it } from 'vitest';
import { mergeRunPages, nextRunsCursor } from '@/lib/monitoring/runs';
import type { JobRunDto, JobRunsPage } from '@/types/api';

function run(id: string, startedAtUtc: string): JobRunDto {
  return {
    id,
    jobName: 'retention',
    instance: 'api-1',
    status: 'Succeeded',
    startedAtUtc,
    finishedAtUtc: startedAtUtc,
    durationMs: 1,
    error: null,
  };
}

describe('nextRunsCursor (D4)', () => {
  it('is the oldest startedAtUtc on the page when older runs exist', () => {
    const page: JobRunsPage = {
      runs: [run('a', '2026-09-20T02:00:00Z'), run('b', '2026-09-19T02:00:00Z')],
      hasMore: true,
    };

    expect(nextRunsCursor(page)).toBe('2026-09-19T02:00:00Z');
  });

  it('is undefined when the API says nothing older exists, or the page is empty', () => {
    expect(
      nextRunsCursor({ runs: [run('a', '2026-09-20T02:00:00Z')], hasMore: false }),
    ).toBeUndefined();
    expect(nextRunsCursor({ runs: [], hasMore: true })).toBeUndefined();
  });

  it('does not assume the page is sorted', () => {
    const page: JobRunsPage = {
      runs: [run('b', '2026-09-19T02:00:00Z'), run('a', '2026-09-20T02:00:00Z')],
      hasMore: true,
    };

    expect(nextRunsCursor(page)).toBe('2026-09-19T02:00:00Z');
  });
});

describe('mergeRunPages', () => {
  it('drops the run the inclusive cursor returns twice, keeping first-seen order', () => {
    // `to` is inclusive on startedAtUtc (Monitoring.md §7), so the run at the cursor heads the
    // next page as well. Rendering it twice would read as two runs.
    const first: JobRunsPage = {
      runs: [run('a', '2026-09-20T02:00:00Z'), run('b', '2026-09-19T02:00:00Z')],
      hasMore: true,
    };
    const second: JobRunsPage = {
      runs: [run('b', '2026-09-19T02:00:00Z'), run('c', '2026-09-18T02:00:00Z')],
      hasMore: false,
    };

    expect(mergeRunPages([first, second]).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
