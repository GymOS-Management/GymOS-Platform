import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestEmailCard } from '@/features/settings/test-email-card';
import { ApiError } from '@/lib/api/problems';

describe('TestEmailCard', () => {
  it('asks for the probe on click and reports a reached stage as a failure, not an error', async () => {
    const onTest = vi.fn();
    const { rerender } = render(
      <TestEmailCard canManage result={null} busy={false} error={null} onTest={onTest} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(onTest).toHaveBeenCalledTimes(1);

    rerender(
      <TestEmailCard
        canManage
        result={{ ok: false, stage: 'Authenticate', server: null, error: '535 bad credentials' }}
        busy={false}
        error={null}
        onTest={onTest}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Failed at the Authenticate stage.');
    expect(screen.getByRole('status')).toHaveTextContent('535 bad credentials');
  });

  it('shows the API’s own sentence when the sender is disabled', () => {
    const disabled = new ApiError(
      400,
      'settings.email_disabled',
      'Email is disabled; enable it and save before testing the connection.',
      false,
    );
    render(
      <TestEmailCard canManage result={null} busy={false} error={disabled} onTest={vi.fn()} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Email is disabled/);
  });

  it('renders nothing without settings.manage', () => {
    const { container } = render(
      <TestEmailCard canManage={false} result={null} busy={false} error={null} onTest={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
