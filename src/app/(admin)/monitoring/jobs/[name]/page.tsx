'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiErrorText } from '@/components/feedback/api-error-text';
import { PageHeader } from '@/components/layout/page-header';
import { JobRunsList, type RunStatusFilter } from '@/features/monitoring/job-runs-list';
import { monitoring } from '@/lib/api/endpoints';
import { mergeRunPages, nextRunsCursor } from '@/lib/monitoring/runs';

const PAGE_SIZE = 50;

/**
 * Did the job that should have run last night actually run (F5-DESIGN D4).
 *
 * `useInfiniteQuery` with a time cursor: each page's `to` is the oldest `startedAtUtc` of the page
 * before, which is how `hasMore` is defined (Monitoring.md §7). Changing the status filter starts a
 * new query — a filter is a different history, not a further page of the same one.
 *
 * `useParams` already returns the `[name]` segment decoded: Next.js's route matcher runs the value
 * through `decodeURIComponent` while extracting params from the pathname (see
 * `next/dist/shared/lib/router/utils/route-matcher.js`), the same step whether the page loads fresh
 * or is reached by client-side navigation. Decoding again here would double-decode a job name that
 * itself contains a percent-encoded character, so `params.name` is used as-is — it is already the
 * plain name `JobsTable` encoded with `encodeURIComponent` when it built the link.
 */
export default function JobRunsPage() {
  const params = useParams<{ name: string }>();
  const name = params.name;
  const [status, setStatus] = useState<RunStatusFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ['monitoring', 'runs', name, status],
    queryFn: ({ pageParam, signal }) =>
      monitoring.runs(
        name,
        { to: pageParam, status: status === 'all' ? undefined : status, limit: PAGE_SIZE },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => nextRunsCursor(lastPage),
  });

  return (
    <>
      <PageHeader
        title={name}
        description={
          <>
            Run history, newest first.{' '}
            <Link href="/monitoring" className="underline underline-offset-2">
              Back to monitoring
            </Link>
          </>
        }
      />

      {query.isPending ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError ? (
        <ApiErrorText error={query.error} />
      ) : (
        <JobRunsList
          runs={mergeRunPages(query.data.pages)}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          status={status}
          onStatusChange={setStatus}
          onLoadOlder={() => void query.fetchNextPage()}
        />
      )}
    </>
  );
}
