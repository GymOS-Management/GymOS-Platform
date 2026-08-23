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
 * ## Why `docker exec`, not a SQL Server client
 *
 * A client library would be a new dependency for one INSERT, and this repo's dependency policy is not
 * a formality — F3 shipped its charts with no new runtime dependency at all. `docker exec` reaches the
 * container the README already tells you to start, needs no `sqlcmd` on the host, and costs nothing.
 *
 * Set `E2E_DB_CONTAINER` if yours is named something other than `gymos-mssql`.
 */

const CONTAINER = process.env.E2E_DB_CONTAINER ?? 'gymos-mssql';
const DB_USER = process.env.E2E_DB_USER ?? 'sa';
const DB_NAME = process.env.E2E_DB_NAME ?? 'gymos';

/**
 * `sa`, not `gymos_app`, and only here.
 *
 * The seed writes `daily_platform_stats`, a read model no endpoint exposes a write for, so there is
 * no application principal whose job this is. `gymos_app` would in fact succeed — it holds
 * `db_datawriter` — but reaching for the deployment's request-serving credential in a test script is
 * how that credential ends up in one that runs somewhere real. `sa` is unambiguous about being a
 * local-container-only affordance, which is what this is.
 */
const DB_PASSWORD = process.env.E2E_DB_PASSWORD ?? 'Gymos_dev_sa_password1';

/** Where the mssql image puts sqlcmd. Not on PATH in that image, so it is spelled out. */
const SQLCMD = '/opt/mssql-tools18/bin/sqlcmd';

/**
 * `__dirname`, not `import.meta.url`: this package has no `"type": "module"`, so Playwright transpiles
 * the setup file to CommonJS and `import.meta` is a syntax error there — it fails as
 * "exports is not defined", which points nowhere near the cause.
 */
const HERE = __dirname;

/**
 * Runs SQL in the container and returns stdout.
 *
 * `-b` matters more than it looks: without it `sqlcmd` exits 0 after a failed statement, so a seed
 * that inserted nothing would let the specs fail later with "empty series" and send the reader
 * looking at the range control instead of at this file. It is the counterpart of the
 * `ON_ERROR_STOP=1` the psql version passed, and it is needed for the same reason.
 *
 * The output flags together reproduce psql's `-At`: `-h -1` drops the header, `-W` trims the padding
 * `sqlcmd` otherwise adds to every column, and `-s '|'` sets the separator the caller splits on.
 * Without all three the verification query below returns a fixed-width banner rather than two
 * numbers, and `Number()` quietly yields NaN.
 *
 * `-C` trusts the container's self-signed certificate; `-N` would be pointless without it since the
 * connection never leaves the Docker network.
 */
function sqlcmd(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      SQLCMD,
      '-S',
      'localhost',
      '-U',
      DB_USER,
      '-P',
      DB_PASSWORD,
      '-d',
      DB_NAME,
      '-C',
      '-b',
      '-h',
      '-1',
      '-W',
      '-s',
      '|',
      '-i',
      '/dev/stdin',
    ],
    { input: sql, encoding: 'utf8' },
  );
}

export default function globalSetup() {
  const sql = readFileSync(join(HERE, 'seed-analytics.sql'), 'utf8');

  try {
    sqlcmd(sql);
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
  // DATEDIFF, because subtracting two `date` values is a PostgreSQL affordance: SQL Server has no
  // operator for it and would try to convert one side to a number. Same arithmetic, spelled out.
  const [rows, missing] = sqlcmd(
    `SET NOCOUNT ON;
     SELECT COUNT(*), DATEDIFF(day, MIN(stat_date), MAX(stat_date)) + 1 - COUNT(*)
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
