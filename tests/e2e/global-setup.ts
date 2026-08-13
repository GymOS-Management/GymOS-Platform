import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes the `daily_platform_stats` rows the analytics specs assert against, before the suite runs.
 *
 * ## Why this is not a fixture, an API call, or a mock
 *
 * There is no write endpoint to call: `daily_platform_stats` is a read model compiled nightly by
 * `PlatformStatsJob`, and the suite disables the job host on purpose. Mocking the response would test
 * the chart against a fake and prove nothing about the proxy or the contract, which is the whole
 * reason this suite exists (`tests/e2e/README.md`). So the rows go into the real database, and the
 * assertions run against the real API reading them back.
 *
 * ## Why `docker exec`, not a Postgres client
 *
 * A client library would be a new dependency for one INSERT, and this repo's dependency policy is not
 * a formality — F3 shipped its charts with no new runtime dependency at all. `docker exec` reaches the
 * container the README already tells you to start, needs no `psql` on the host, and costs nothing.
 *
 * Set `E2E_DB_CONTAINER` if yours is named something other than `gymos-e2e-db`.
 */

const CONTAINER = process.env.E2E_DB_CONTAINER ?? 'gymos-e2e-db';
const DB_USER = process.env.E2E_DB_USER ?? 'gymos';
const DB_NAME = process.env.E2E_DB_NAME ?? 'gymos';

/**
 * `__dirname`, not `import.meta.url`: this package has no `"type": "module"`, so Playwright transpiles
 * the setup file to CommonJS and `import.meta` is a syntax error there — it fails as
 * "exports is not defined", which points nowhere near the cause.
 */
const HERE = __dirname;

/**
 * Runs SQL in the container and returns stdout.
 *
 * `ON_ERROR_STOP=1` matters more than it looks: without it `psql` reports success after a failed
 * statement, so a seed that inserted nothing would let the specs fail later with "empty series" and
 * send the reader looking at the range control instead of at this file.
 */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      DB_USER,
      '-d',
      DB_NAME,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8' },
  );
}

export default function globalSetup() {
  const sql = readFileSync(join(HERE, 'seed-analytics.sql'), 'utf8');

  try {
    psql(sql);
  } catch (cause) {
    // Named explicitly, because the two likely causes have nothing to do with the tests: the
    // container is not running, or the backend has not applied its migrations yet so the table does
    // not exist. Both read as an inscrutable execFileSync stack otherwise.
    throw new Error(
      `Could not seed daily_platform_stats in container '${CONTAINER}'. Is it running, and has the ` +
        `backend applied its migrations? See tests/e2e/README.md.`,
      { cause },
    );
  }

  // The seed is verified here rather than trusted, so a drift in the SQL surfaces as one clear error
  // before the browser starts instead of as a puzzling assertion failure 20 tests later.
  //
  // `missing` is the span minus the rows present — the same arithmetic `buildSeries` does, and the
  // reason a single missing day can only be a single break in the line.
  const [rows, missing] = psql(
    `SELECT count(*), max(stat_date) - min(stat_date) + 1 - count(*)
     FROM platform.daily_platform_stats;`,
  )
    .trim()
    .split('|')
    .map(Number);

  if (rows !== 13 || missing !== 1) {
    throw new Error(
      `The analytics seed did not produce the shape the specs assert: expected 13 rows with exactly ` +
        `1 missing day (one interior gap), got ${rows} rows with ${missing} missing. ` +
        `See tests/e2e/seed-analytics.sql.`,
    );
  }

  console.log(`Seeded ${rows} daily_platform_stats rows with a deliberate ${missing}-day gap.`);
}
