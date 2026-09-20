/**
 * Numbers from `/monitoring/*`, as an operator reads them.
 *
 * Every numeric field in the contract is typed `number | string` because the backend's OpenAPI
 * generator declares integers that way (the same reason `Pagination.totalCount` is). Coerced here,
 * once, rather than by hand-editing the generated types — the drift AD-12 forbids.
 */
function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'string' ? Number(value) : value;

  return Number.isFinite(parsed) ? parsed : null;
}

/** A run's wall time. Null (a run still going, or one the recorder never finished) is a dash. */
export function formatDuration(ms: number | string | null | undefined): string {
  const value = toNumber(ms);

  if (value === null) {
    return '—';
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }

  if (value < 60_000) {
    return `${(value / 1000).toFixed(1)} s`;
  }

  if (value < 3_600_000) {
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return `${minutes} min ${seconds} s`;
  }

  const hours = Math.floor(value / 3_600_000);
  const minutes = Math.round((value % 3_600_000) / 60_000);
  return `${hours} h ${minutes} min`;
}

/** Uptime and the outbox's oldest-message age, both `int64` seconds on the wire. */
export function formatSeconds(seconds: number | string | null | undefined): string {
  const value = toNumber(seconds);

  if (value === null) {
    return '—';
  }

  if (value < 60) {
    return `${Math.round(value)} s`;
  }

  if (value < 3600) {
    return `${Math.floor(value / 60)} min`;
  }

  if (value < 86_400) {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${hours} h ${minutes} min`;
  }

  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3600);
  return `${days} d ${hours} h`;
}

/**
 * Null until the sampler has two readings (Monitoring.md §6). Returned as null rather than a dash so
 * the tile can say "Warming up" — a dash beside "CPU" reads as a broken metric, not a young process.
 */
export function formatCpu(percent: number | string | null | undefined): string | null {
  const value = toNumber(percent);

  return value === null ? null : `${value.toFixed(1)}%`;
}

export function formatMegabytes(mb: number | string): string {
  const value = toNumber(mb);

  return value === null ? '—' : `${new Intl.NumberFormat('en-GB').format(Math.round(value))} MB`;
}
