import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PlanForm } from '@/features/plans/plan-form';

describe('PlanForm', () => {
  it('refuses a blank code, because code is the plan permanent handle', async () => {
    const onSubmit = vi.fn();
    render(<PlanForm onSubmit={onSubmit} submitLabel="Create plan" />);

    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the entered values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PlanForm onSubmit={onSubmit} submitLabel="Create plan" />);

    await userEvent.type(screen.getByLabelText(/code/i), 'PRO');
    await userEvent.type(screen.getByLabelText(/name/i), 'Professional');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PRO', name: 'Professional' }),
    );
  });

  it('submits null for capacity limits left blank, because null means unlimited', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PlanForm onSubmit={onSubmit} submitLabel="Create plan" />);

    await userEvent.type(screen.getByLabelText(/code/i), 'PRO');
    await userEvent.type(screen.getByLabelText(/name/i), 'Professional');
    // Every capacity-limit input is left blank.
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        maxMembers: null,
        maxTrainers: null,
        maxStaff: null,
        storageLimitMb: null,
      }),
    );
  });

  it('submits a typed capacity limit as a number', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PlanForm onSubmit={onSubmit} submitLabel="Create plan" />);

    await userEvent.type(screen.getByLabelText(/code/i), 'PRO');
    await userEvent.type(screen.getByLabelText(/name/i), 'Professional');
    await userEvent.type(screen.getByLabelText(/max members/i), '500');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ maxMembers: 500 }));
  });

  it('refuses an explicit zero capacity limit, because zero admits nobody', async () => {
    const onSubmit = vi.fn();
    render(<PlanForm onSubmit={onSubmit} submitLabel="Create plan" />);

    await userEvent.type(screen.getByLabelText(/code/i), 'PRO');
    await userEvent.type(screen.getByLabelText(/name/i), 'Professional');
    await userEvent.type(screen.getByLabelText(/max members/i), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
