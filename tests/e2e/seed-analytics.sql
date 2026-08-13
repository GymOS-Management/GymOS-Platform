-- Seeds `daily_platform_stats` for the analytics half of `analytics-journey.spec.ts`.
--
-- `/analytics/*` reads only this read model, written once a night by `PlatformStatsJob` for
-- *yesterday*. An E2E run cannot wait for that, and the job is disabled during the suite
-- (`Jobs__Enabled=false`) precisely so no sweep moves state mid-run — so the rows are written here
-- instead.
--
-- ## Every date is relative to CURRENT_DATE, deliberately
--
-- Hard-coded dates would sit inside the console's default range (last 30 days) on the day they were
-- written and fall out of it silently afterwards — the specs would go back to seeing an empty series,
-- which is the exact failure this seed exists to remove. The window below is
-- `CURRENT_DATE - 14 .. CURRENT_DATE - 1`, comfortably inside the default range with a fortnight of
-- margin at each end, so a UTC-versus-local disagreement about "today" cannot push it out either.
--
-- ## The gap is the point
--
-- One day (`CURRENT_DATE - 7`) is left out on purpose, with data on both sides of it, so it is an
-- *interior* gap: F3-DESIGN D3's note counts only missing days between two days that exist, never
-- `to - from`. Fourteen candidate days minus that one gives 13 rows, one break, one missing day — the
-- sentence the specs assert.

BEGIN;

-- The suite's own rows, not the operator's: this table is a read model that is rebuilt nightly and
-- never backfilled, so a test DB's copy of it is disposable by definition. Deleting first also makes
-- the seed re-runnable, which the unique index on `stat_date` would otherwise refuse.
-- `daily_platform_stats_mrr` goes with it via ON DELETE CASCADE.
DELETE FROM platform.daily_platform_stats;

INSERT INTO platform.daily_platform_stats (
  id,
  stat_date,
  total_gyms,
  active_gyms,
  suspended_gyms,
  provisioning_gyms,
  new_gyms,
  canceled_gyms,
  expired_gyms,
  created_at_utc
)
SELECT
  gen_random_uuid(),
  d.stat_day,
  -- The population three must sum to the total, because the Growth screen draws them as a stacked
  -- area whose height *is* `totalGyms` (D4) — `provisioningGyms` exists in the response precisely so
  -- they reconcile. A seed that broke that would make the chart lie in a way no assertion here would
  -- catch, so it is maintained by construction: 10 + i active, 2 suspended, 1 provisioning.
  13 + d.i,
  10 + d.i,
  2,
  1,
  -- An event count, on its own axis and deliberately *not* reconcilable with the population above:
  -- a gym created and deleted the same day still counts as one created (D4).
  1,
  -- Churn split by cause, which is why M5 refused the frozen spec's single `churned_gyms` column.
  -- Both are non-zero across the window so the stacked columns have two visible segments to draw.
  CASE WHEN d.i % 5 = 0 THEN 1 ELSE 0 END,
  CASE WHEN d.i % 7 = 3 THEN 1 ELSE 0 END,
  now()
FROM (
  SELECT
    g::date AS stat_day,
    (g::date - (CURRENT_DATE - 14)) AS i
  FROM generate_series(CURRENT_DATE - 14, CURRENT_DATE - 1, interval '1 day') AS g
) AS d
WHERE d.stat_day <> CURRENT_DATE - 7;

-- Two currencies, never one. The revenue spec asserts there is no combined `Total` column (D2), and
-- against a single-currency screen a summed total and a per-currency column are the same column —
-- the rule would be untestable. Amounts differ per currency so a screen that summed them would show
-- a number matching neither.
INSERT INTO platform.daily_platform_stats_mrr (id, stats_id, amount_amount, amount_currency)
SELECT
  gen_random_uuid(),
  s.id,
  1000 + 50 * (s.stat_date - (CURRENT_DATE - 14)),
  'EUR'
FROM platform.daily_platform_stats AS s
UNION ALL
SELECT
  gen_random_uuid(),
  s.id,
  300 + 10 * (s.stat_date - (CURRENT_DATE - 14)),
  'USD'
FROM platform.daily_platform_stats AS s;

COMMIT;
