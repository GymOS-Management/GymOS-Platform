import { describe, expect, it } from 'vitest';
import { linearScale } from '@/components/charts/chart-frame';

/** Every tick is a whole number. */
function allIntegers(ticks: readonly number[]): boolean {
  return ticks.every((tick) => Number.isInteger(tick));
}

describe('linearScale', () => {
  it('always includes zero, whatever the data', () => {
    // The deliberate refusal the function documents: a baseline that is not zero exaggerates every
    // difference on the chart.
    expect(linearScale([40, 42, 45]).min).toBe(0);
  });

  it('labels whole-number counts with whole numbers', () => {
    // Gym, churn and new-gym counts are integers, and small integers are the normal case on a young
    // platform. `max / 4` produced quarters: a day with 3 new gyms gave a ceiling of 5 and an axis
    // reading 0, 1.25, 2.5, 3.75, 5 — quarters of a gym.
    const scale = linearScale([3]);

    expect(allIntegers(scale.ticks)).toBe(true);
    expect(scale.max).toBeGreaterThanOrEqual(3);
  });

  it.each([
    [1, [1]],
    [3, [3]],
    [7, [7]],
    [42, [40, 42]],
    [137, [100, 137]],
  ])('keeps integer ticks and covers the data for a max around %i', (highest, values) => {
    const scale = linearScale(values);

    expect(allIntegers(scale.ticks)).toBe(true);
    expect(scale.max).toBeGreaterThanOrEqual(highest);
    // The top tick is the axis maximum, or the axis lies about where the plot ends.
    expect(scale.ticks.at(-1)).toBe(scale.max);
    expect(scale.ticks[0]).toBe(0);
  });

  it('leaves fractional data alone', () => {
    // Money is not a count. Forcing integer ticks onto an MRR axis would round the scale away from
    // the values it describes, so the integer rule applies only when the data is integral.
    const scale = linearScale([49.99]);

    expect(scale.max).toBeGreaterThanOrEqual(49.99);
    expect(scale.ticks[0]).toBe(0);
  });

  it('handles an empty series without producing a degenerate axis', () => {
    const scale = linearScale([]);

    expect(scale.max).toBeGreaterThan(0);
    expect(scale.ticks[0]).toBe(0);
  });
});
