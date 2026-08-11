import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelSubscriptionDialog } from '@/features/subscriptions/cancel-dialog';
import { subscriptions } from '@/lib/api/endpoints';

vi.mock('@/lib/api/endpoints', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/endpoints')>();
  return {
    ...actual,
    subscriptions: {
      ...actual.subscriptions,
      cancel: vi.fn(),
    },
  };
});

const cancelMock = subscriptions.cancel as ReturnType<typeof vi.fn>;

const fakeSubscription = { id: 's1', status: 'Canceled' };

/**
 * D-note 5: at-period-end vs. immediate is the entire point of this dialog, and defaulting to
 * immediate — or letting a blank reason through — would misinform an operator into cutting off a
 * paying customer, or recording a cancellation with no reason. Each test here pins one of those two
 * rules directly against the submitted request, not just against what's visible on screen.
 */
describe('CancelSubscriptionDialog', () => {
  beforeEach(() => {
    cancelMock.mockReset();
    cancelMock.mockResolvedValue(fakeSubscription);
  });

  it('defaults to "at period end" — changing nothing sends immediately: false', async () => {
    const user = userEvent.setup();
    const onCanceled = vi.fn();
    render(<CancelSubscriptionDialog gymId="g1" canManage onCanceled={onCanceled} />);

    await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    await user.type(screen.getByLabelText(/reason/i), 'Requested by owner');
    await user.click(screen.getByRole('button', { name: 'Schedule cancellation' }));

    expect(cancelMock).toHaveBeenCalledWith('g1', {
      reason: 'Requested by owner',
      immediately: false,
    });
  });

  it('blocks submission while the reason is empty, and never calls the API', async () => {
    const user = userEvent.setup();
    const onCanceled = vi.fn();
    render(<CancelSubscriptionDialog gymId="g1" canManage onCanceled={onCanceled} />);

    await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));

    // The confirm button is disabled with no reason typed at all — clicking it must be a no-op.
    const confirmButton = screen.getByRole('button', { name: 'Schedule cancellation' });
    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);

    expect(cancelMock).not.toHaveBeenCalled();
    expect(onCanceled).not.toHaveBeenCalled();
  });

  it('blocks submission while the reason is only whitespace', async () => {
    const user = userEvent.setup();
    const onCanceled = vi.fn();
    render(<CancelSubscriptionDialog gymId="g1" canManage onCanceled={onCanceled} />);

    await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    await user.type(screen.getByLabelText(/reason/i), '   ');

    const confirmButton = screen.getByRole('button', { name: 'Schedule cancellation' });
    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);

    expect(cancelMock).not.toHaveBeenCalled();
    expect(onCanceled).not.toHaveBeenCalled();
  });

  it('sends immediately: true only when "Immediately" is explicitly selected', async () => {
    const user = userEvent.setup();
    const onCanceled = vi.fn();
    render(<CancelSubscriptionDialog gymId="g1" canManage onCanceled={onCanceled} />);

    await user.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    await user.type(screen.getByLabelText(/reason/i), 'Chargeback dispute');
    await user.click(screen.getByLabelText(/immediately/i));
    await user.click(screen.getByRole('button', { name: 'Cancel immediately' }));

    expect(cancelMock).toHaveBeenCalledWith('g1', {
      reason: 'Chargeback dispute',
      immediately: true,
    });
  });
});
