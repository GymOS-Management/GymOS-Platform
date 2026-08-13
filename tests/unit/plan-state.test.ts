import { describe, expect, it } from 'vitest';
import { fromResponseValue, toRequestValue } from '@/lib/features/plan-state';

describe("the plan's three states", () => {
  it('maps each state to the value the API expects', () => {
    expect(toRequestValue('included')).toBe(true);
    expect(toRequestValue('excluded')).toBe(false);
    // null clears the plan's opinion. Not false: "this plan excludes CRM" and "this plan has no
    // view on CRM" answer differently the moment the platform default moves.
    expect(toRequestValue('default')).toBeNull();
  });

  it('reads a response back into a state, treating absence as silence', () => {
    expect(fromResponseValue(true)).toBe('included');
    expect(fromResponseValue(false)).toBe('excluded');
    expect(fromResponseValue(null)).toBe('default');
    expect(fromResponseValue(undefined)).toBe('default');
  });
});
