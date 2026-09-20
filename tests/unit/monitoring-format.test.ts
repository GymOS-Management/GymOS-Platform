import { describe, expect, it } from 'vitest';
import { formatCpu, formatDuration, formatMegabytes, formatSeconds } from '@/lib/monitoring/format';

describe('formatDuration', () => {
  it('renders a missing duration as a dash, not zero', () => {
    // A Running row has no duration yet; "0 ms" would say it finished instantly.
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
  });

  it("picks the unit by magnitude and accepts the contract's string form", () => {
    expect(formatDuration(420)).toBe('420 ms');
    expect(formatDuration('12345')).toBe('12.3 s');
    expect(formatDuration(192_000)).toBe('3 min 12 s');
    expect(formatDuration(3_780_000)).toBe('1 h 3 min');
  });

  it('floors sub-unit remainders to prevent carry-over into parent units', () => {
    expect(formatDuration(3_599_999)).toBe('59 min 59 s');
    expect(formatDuration(7_199_999)).toBe('1 h 59 min');
  });
});

describe('formatSeconds', () => {
  it('scales from seconds to days', () => {
    expect(formatSeconds(45)).toBe('45 s');
    expect(formatSeconds(720)).toBe('12 min');
    expect(formatSeconds(11_520)).toBe('3 h 12 min');
    expect(formatSeconds('183600')).toBe('2 d 3 h');
    expect(formatSeconds(null)).toBe('—');
  });

  it('floors seconds to prevent rounding into the next minute', () => {
    expect(formatSeconds(59.6)).toBe('59 s');
  });
});

describe('formatCpu and formatMegabytes', () => {
  it('returns null for a CPU figure the sampler has not produced yet', () => {
    // The first reading after start-up is null because a delta needs two samples (Monitoring.md §6).
    expect(formatCpu(null)).toBeNull();
    expect(formatCpu('4.25')).toBe('4.3%');
    expect(formatCpu(0)).toBe('0.0%');
  });

  it('labels memory in the unit the API uses', () => {
    expect(formatMegabytes(312)).toBe('312 MB');
    expect(formatMegabytes('1024')).toBe('1,024 MB');
  });
});
