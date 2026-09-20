import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { JobsTable } from '@/features/monitoring/jobs-table';
import { OutboxTile } from '@/features/monitoring/outbox-tile';
import { ProcessTile } from '@/features/monitoring/process-tile';
import type { JobStateDto, OutboxDepth, ProcessMetrics } from '@/types/api';

const succeeded = {
  id: 'run-1',
  jobName: 'retention',
  instance: 'replica-a',
  status: 'Succeeded',
  startedAtUtc: '2026-09-20T02:00:00Z',
  finishedAtUtc: '2026-09-20T02:00:04Z',
  durationMs: 4000,
  error: null,
};

function jobState(partial: Partial<JobStateDto>): JobStateDto {
  return {
    name: 'retention',
    schedule: 'daily at 02:00 UTC',
    lastRun: succeeded,
    lastSucceededAtUtc: '2026-09-20T02:00:00Z',
    nextDueUtc: '2026-09-21T02:00:00Z',
    stale: false,
    ...partial,
  };
}

/** DataTable renders a table and mobile cards; the table's rows are the ones asserted on. */
function tableRow(text: string): HTMLElement {
  const row = screen.getAllByRole('row').find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`no row containing ${text}`);
  return row;
}

describe('JobsTable', () => {
  it('reads a job with no history as not yet run, and never as stale (D2)', () => {
    render(
      <JobsTable
        jobs={[jobState({ name: 'platform-stats', lastRun: null, lastSucceededAtUtc: null })]}
      />,
    );

    expect(tableRow('platform-stats')).toHaveTextContent('Has not run yet');
    expect(tableRow('platform-stats')).not.toHaveTextContent('Stale');
  });

  it('shows Stale because the API said so, whatever the timestamps suggest (D2)', () => {
    render(<JobsTable jobs={[jobState({ stale: true })]} />);

    expect(tableRow('retention')).toHaveTextContent('Stale');
  });

  it('prints a failed run’s error text unchanged (D2)', () => {
    const error = 'TimeoutException: The operation has timed out.';
    render(<JobsTable jobs={[jobState({ lastRun: { ...succeeded, status: 'Failed', error } })]} />);

    expect(tableRow('retention')).toHaveTextContent(error);
  });

  it('links each job to its run history', () => {
    render(<JobsTable jobs={[jobState({ name: 'subscription-renewal' })]} />);

    expect(screen.getAllByRole('link', { name: 'subscription-renewal' })[0]).toHaveAttribute(
      'href',
      '/monitoring/jobs/subscription-renewal',
    );
  });
});

describe('ProcessTile (D3)', () => {
  const sample: ProcessMetrics = {
    cpuPercent: null,
    workingSetMb: 312,
    uptimeSeconds: 720,
    instance: 'replica-a',
    sampledAtUtc: '2026-09-20T10:00:00Z',
  };

  it('names the replica and says the CPU figure is warming up while it is null', () => {
    render(<ProcessTile process={sample} />);

    expect(screen.getByText(/replica-a/)).toBeVisible();
    expect(screen.getByText('Warming up')).toBeVisible();
    expect(screen.getByText('312 MB')).toBeVisible();
  });

  it('shows the CPU figure once the sampler has one', () => {
    render(<ProcessTile process={{ ...sample, cpuPercent: 4.25 }} />);

    expect(screen.getByText('4.3%')).toBeVisible();
  });

  it('says there is no sample yet when the block is null', () => {
    render(<ProcessTile process={null} />);

    expect(screen.getByText('No sample yet.')).toBeVisible();
  });
});

describe('OutboxTile (D3)', () => {
  it('prints the API’s note verbatim', () => {
    const outbox: OutboxDepth = {
      totalMessages: 12,
      messagesLast24h: 3,
      oldestMessageAgeSeconds: 90,
      note: 'Depth only. Delivery lag and dead letters are reported once the outbox processor exists.',
    };
    render(<OutboxTile outbox={outbox} />);

    expect(screen.getByText(outbox.note)).toBeVisible();
    expect(screen.getByText('12')).toBeVisible();
    expect(screen.getByText('1 min')).toBeVisible();
  });
});
