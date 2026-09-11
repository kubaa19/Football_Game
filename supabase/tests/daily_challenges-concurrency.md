# Daily challenge concurrency - DEFERRED / NOT EXECUTED

These procedures need two persistent independent PostgreSQL connections. SQL Editor
requests or mocks are not proof of concurrency. Do not run them automatically.
No local installation is required by Stage 6. Use a separately approved development
maintenance session or a disposable test database when these tests are scheduled.

## Isolated setup for later execution

Use the SECTION B setup from `daily_challenges.sql`, from its BEGIN through helper
function creation, on a coordinator connection as postgres. This copies definitions
only; review every namespace substitution first. It must create `fq6_test`, never
replace an existing schema. Insert exactly five approved valid questions with IDs
`f6400000-0000-4000-8000-000000000001` through `...000005`, four options A/B/C/D,
correct_index 1, difficulty 1, category world_cup and a nonempty explanation.

Unlike the single-session rollback tests, two connections need visible committed
fixtures: commit this ISOLATED setup only after separate explicit approval. Never
commit the normal test files. Do not create fixtures in public. Check both connections:

```sql
SELECT current_database(), pg_backend_pid();
SELECT count(*) FROM fq6_test.questions; -- 5
SELECT count(*) FROM fq6_test.daily_challenges; -- 0 initially
```

Different backend PIDs are required. Copy publisher uses lock namespace 619906,
not the production namespace 610006. Sessions A/B use READ COMMITTED and service_role.

## Same date, two publishers

A:
```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT fq6_test.ensure_daily_challenge(DATE '2040-08-01');
-- Keep transaction open: created=true, no COMMIT yet.
```
B:
```sql
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL lock_timeout = '60s';
SELECT fq6_test.ensure_daily_challenge(DATE '2040-08-01');
-- Must wait; release A within 60 seconds.
```
A: `COMMIT;`. B must return created=false and exactly the same challengeId/questionIds.
B: `COMMIT;`. Coordinator:
```sql
SELECT date, count(*) FROM fq6_test.daily_challenges
WHERE date=DATE '2040-08-01' GROUP BY date; -- one
```
Repeat with unused date 2040-08-02, but A executes ROLLBACK. B then returns created=true.

## Window versus fallback-equivalent single day

A opens a transaction and calls:
```sql
SELECT fq6_test.ensure_daily_challenge_window(DATE '2040-09-01', 8);
```
Do not commit. B opens a transaction and calls single-day ensure for 2040-09-03.
B must block until A commits, then reuse that day's exact stored IDs. Commit B.
Verify eight rows in 2040-09-01..08, each with five unique IDs. This tests the DB
calls used by Cron/fallback, NOT execution of Next.js or the actual scheduler.

## Whole-batch rollback

This deterministic case is already prepared in `daily_challenges.sql`: a challenge
with missing question references exists on the third day. Window publication raises
DAILY_CHALLENGE_INVALID; its earlier two INSERTs must disappear. This is NOT the
separate deferred attempts injected-failure test between result INSERT and completion.

## Cleanup for these separately approved multi-session tests

Close/finish A and B first. On coordinator, verify the exact schema name and its
contents; only then drop `fq6_test` with CASCADE. This removes committed ISOLATED
fixtures, never public data. No cleanup statement is embedded in executable tests.
If a test failed, inspect open transactions before cleanup.

## What remains unverified

- Real public-schema two-session behavior and its deployed role memberships/RLS.
- Next.js start/fallback (not implemented yet).
- Cron activation and a real scheduled run.
- Question mutation versus publication; content immutability is intentionally deferred.
- Existing attempts concurrency and injected-failure procedures remain deferred.
