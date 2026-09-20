import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobRunsList } from '@/features/monitoring/job-runs-list';
import type { JobRunDto } from '@/types/api';

function aRun(id: string, partial: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id,
    jobName: 'invoice-overdue',
    instance: 'replica-b',
    status: 'Succeeded',
    startedAtUtc: '2026-09-20T03:00:00Z',
    finishedAtUtc: '2026-09-20T03:00:02Z',
    durationMs: 2000,
    error: null,
    ...partial,
  };
}

const noop = { onStatusChange: vi.fn(), onLoadOlder: vi.fn() };

describe('JobRunsList (D4)', () => {
  it('offers Load older only while the API says older runs exist', () => {
    const { rerender } = render(
      <JobRunsList runs={[aRun('1')]} hasMore status="all" loadingMore={false} {...noop} />,
    );
    expect(screen.getByRole('button', { name: 'Load older' })).toBeVisible();

    rerender(
      <JobRunsList runs={[aRun('1')]} hasMore={false} status="all" loadingMore={false} {...noop} />,
    );
    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();
  });

  it('asks for the next page when Load older is clicked', async () => {
    const onLoadOlder = vi.fn();
    render(
      <JobRunsList
        runs={[aRun('1')]}
        hasMore
        status="all"
        loadingMore={false}
        onStatusChange={vi.fn()}
        onLoadOlder={onLoadOlder}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Load older' }));

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('reports a status choice by the API’s own name', async () => {
    const onStatusChange = vi.fn();
    render(
      <JobRunsList
        runs={[]}
        hasMore={false}
        status="all"
        loadingMore={false}
        onStatusChange={onStatusChange}
        onLoadOlder={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText('Status'));
    await userEvent.click(screen.getByRole('option', { name: 'Failed' }));

    expect(onStatusChange).toHaveBeenCalledWith('Failed');
  });

  it('shows a failed run’s error text as sent, and a running run’s duration as a dash', () => {
    render(
      <JobRunsList
        runs={[
          aRun('f', { status: 'Failed', error: 'InvalidOperationException: lock lost' }),
          aRun('r', { status: 'Running', finishedAtUtc: null, durationMs: null }),
        ]}
        hasMore={false}
        status="all"
        loadingMore={false}
        {...noop}
      />,
    );

    expect(screen.getAllByText('InvalidOperationException: lock lost')[0]).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('explains an empty history in words', () => {
    render(<JobRunsList runs={[]} hasMore={false} status="all" loadingMore={false} {...noop} />);

    expect(screen.getByText('No runs recorded')).toBeVisible();
  });
});
