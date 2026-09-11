-- SEPARATE OPERATOR ACTION after migration, approval and test review.
-- Run as postgres. No extension installation and no immediate publication.
BEGIN;
DO $$
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run scheduler setup as postgres'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron is not enabled';
  END IF;
END;
$$;
SELECT cron.schedule('footquiz-daily-challenges', '5 * * * *', $job$
  SELECT public.ensure_daily_challenge_window((clock_timestamp() AT TIME ZONE 'UTC')::date, 8);
$job$);
COMMIT;
-- Same name + same postgres owner updates the job on repeated execution.
-- Inspect cron.job and cron.job_run_details manually. An exception fails the whole batch.
