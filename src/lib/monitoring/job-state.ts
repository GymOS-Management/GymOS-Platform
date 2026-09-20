import type { JobStateDto } from '@/types/api';

export type JobTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface JobPresentation {
  label: string;
  tone: JobTone;
}

/**
 * One reading of a job's state for the badge on the jobs table (F5-DESIGN D2).
 *
 * **`stale` is the API's word, not ours.** `JobStateAssembler.IsStale` knows the schedule's period,
 * the grace window, and that a job which has never succeeded is stale regardless of timing
 * (Monitoring.md §3). A second copy of that rule here would drift the day the backend's changes, so
 * this function only *orders* the facts the payload already states.
 */
export function presentJobState(job: JobStateDto): JobPresentation {
  if (job.lastRun === null) {
    // No history is not a failure: the job has had no chance yet, and the API agrees — it never
    // flags such a job stale (§3). Said in words rather than left as an empty cell.
    return { label: 'Has not run yet', tone: 'neutral' };
  }

  if (job.stale) {
    return { label: 'Stale', tone: 'danger' };
  }

  if (job.lastRun.status === 'Running') {
    return { label: 'Running', tone: 'info' };
  }

  if (job.lastRun.status === 'Failed') {
    return { label: 'Last run failed', tone: 'warning' };
  }

  return { label: 'Healthy', tone: 'success' };
}
