import { describe, expect, it } from 'vitest';
import { presentJobState } from '@/lib/monitoring/job-state';
import type { JobRunDto, JobStateDto } from '@/types/api';

function run(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 'r1',
    jobName: 'retention',
    instance: 'api-1',
    status: 'Succeeded',
    startedAtUtc: '2026-09-20T02:00:00Z',
    finishedAtUtc: '2026-09-20T02:00:04Z',
    durationMs: 4000,
    error: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobStateDto> = {}): JobStateDto {
  return {
    name: 'retention',
    schedule: 'daily at 02:00 UTC',
    lastRun: run(),
    lastSucceededAtUtc: '2026-09-20T02:00:00Z',
    nextDueUtc: '2026-09-21T02:00:00Z',
    stale: false,
    ...overrides,
  };
}

describe('presentJobState (D2)', () => {
  it('says a job with no history has not run yet — and never calls it stale', () => {
    expect(presentJobState(job({ lastRun: null, lastSucceededAtUtc: null }))).toEqual({
      label: 'Has not run yet',
      tone: 'neutral',
    });
  });

  it("renders the API's stale flag, never its own arithmetic", () => {
    // A run four seconds old is "stale" if the API says so: the rule (period, grace, never-succeeded)
    // lives in JobStateAssembler, and a second copy here would drift from it.
    expect(presentJobState(job({ stale: true })).label).toBe('Stale');
    expect(presentJobState(job({ stale: true })).tone).toBe('danger');
  });

  it('shows a run still in progress', () => {
    const state = presentJobState(
      job({ lastRun: run({ status: 'Running', finishedAtUtc: null, durationMs: null }) }),
    );

    expect(state).toEqual({ label: 'Running', tone: 'info' });
  });

  it('names a failed last run that the API does not yet call stale', () => {
    // Possible only for a job that has succeeded before within two periods (Monitoring.md §3 rule 3):
    // "the last run failed" is true and worth saying without pretending to know more.
    const state = presentJobState(
      job({ lastRun: run({ status: 'Failed', error: 'SqlException: x' }) }),
    );

    expect(state).toEqual({ label: 'Last run failed', tone: 'warning' });
  });

  it('is healthy otherwise', () => {
    expect(presentJobState(job())).toEqual({ label: 'Healthy', tone: 'success' });
  });
});
