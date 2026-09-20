import type { JobRunDto, JobRunsPage } from '@/types/api';

/**
 * Paging `/monitoring/jobs/{name}/runs` the way `hasMore` is defined (Monitoring.md §7): the next
 * page is the same query with `to` moved to the oldest `startedAtUtc` this page returned. There is
 * no page number and no total — `hasMore` comes from fetching `limit + 1` rows.
 */
export function nextRunsCursor(page: JobRunsPage): string | undefined {
  if (!page.hasMore || page.runs.length === 0) {
    return undefined;
  }

  // Reduced rather than `runs.at(-1)`: the contract says newest first, but the cursor must be
  // right even if a page ever arrives unsorted — a wrong cursor skips history silently.
  return page.runs.reduce(
    (oldest, run) => (run.startedAtUtc < oldest ? run.startedAtUtc : oldest),
    page.runs[0]!.startedAtUtc,
  );
}

/**
 * Every page so far as one list, de-duplicated by id. `to` is inclusive, so the run at the cursor
 * is the last row of one page and the first of the next.
 */
export function mergeRunPages(pages: readonly JobRunsPage[]): JobRunDto[] {
  const seen = new Set<string>();
  const merged: JobRunDto[] = [];

  for (const page of pages) {
    for (const run of page.runs) {
      if (!seen.has(run.id)) {
        seen.add(run.id);
        merged.push(run);
      }
    }
  }

  return merged;
}
