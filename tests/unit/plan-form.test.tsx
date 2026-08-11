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
});
