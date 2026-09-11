-- ISOLATED COPIES ONLY: NOT proof of public RLS/grants or real concurrency.
-- Run whole file as postgres on DEVELOPMENT after both migrations.
-- Only catalog definitions are read; no public application rows are copied.
-- On error ROLLBACK on the SAME connection or close it; SQL Editor cleanup
-- and browser refresh are NOT assumed to guarantee DB rollback.
BEGIN;
DO $$ BEGIN IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF; END $$;
-- Collision aborts. NEVER drop a pre-existing schema to make this test run.
CREATE SCHEMA fq6_test;
REVOKE ALL ON SCHEMA fq6_test FROM PUBLIC;
CREATE TABLE fq6_test.questions (LIKE public.questions INCLUDING ALL);
CREATE TABLE fq6_test.daily_challenges (LIKE public.daily_challenges INCLUDING ALL);
CREATE TABLE fq6_test.quiz_attempts (LIKE public.quiz_attempts INCLUDING ALL);
CREATE TABLE fq6_test.quiz_attempt_answers (LIKE public.quiz_attempt_answers INCLUDING ALL);
CREATE TABLE fq6_test.quiz_results (LIKE public.quiz_results INCLUDING ALL);
-- LIKE does not copy FKs, triggers, RLS or grants. Reconstruct test model explicitly.
ALTER TABLE fq6_test.quiz_attempts ADD FOREIGN KEY(challenge_id) REFERENCES fq6_test.daily_challenges(id);
ALTER TABLE fq6_test.quiz_attempt_answers ADD FOREIGN KEY(attempt_id) REFERENCES fq6_test.quiz_attempts(id);
ALTER TABLE fq6_test.quiz_attempt_answers ADD FOREIGN KEY(question_id) REFERENCES fq6_test.questions(id);
ALTER TABLE fq6_test.quiz_results ADD FOREIGN KEY(attempt_id) REFERENCES fq6_test.quiz_attempts(id);
-- Force qualified composite types in pg_get_functiondef before namespace substitution.
SET LOCAL search_path = pg_catalog;
DO $$ DECLARE sig TEXT; definition TEXT; BEGIN
 FOREACH sig IN ARRAY ARRAY[
  'public.daily_question_ids_valid(uuid[])','public.daily_question_technically_valid(public.questions)',
  'public.guard_question_approval()','public.guard_published_daily_challenge()',
  'public.ensure_daily_challenge(date)','public.ensure_daily_challenge_window(date,integer)',
  'public.record_quiz_attempt_answer(uuid,text,uuid,integer)','public.finish_quiz_attempt(uuid,text,text)'
 ] LOOP
  definition:=replace(pg_get_functiondef(sig::regprocedure),'public.','fq6_test.');
  IF sig LIKE '%record_quiz_attempt_answer%' OR sig LIKE '%finish_quiz_attempt%' THEN
   IF strpos(definition,'(clock_timestamp() AT TIME ZONE ''UTC'')::date')=0 THEN
    RAISE EXCEPTION 'Test clock substitution no longer matches %',sig;
   END IF;
   definition:=replace(definition,'(clock_timestamp() AT TIME ZONE ''UTC'')::date','DATE ''2040-01-01''');
  END IF;
  definition:=replace(definition,'pg_advisory_xact_lock(610006,','pg_advisory_xact_lock(619906,');
  IF strpos(definition,'public.')>0 THEN RAISE EXCEPTION 'Unrewritten public reference'; END IF;
  EXECUTE definition;
 END LOOP;
END $$;
-- Fail explicitly if the copied signature still refers to the real row type.
DO $$
BEGIN
  IF to_regprocedure('fq6_test.daily_question_technically_valid(fq6_test.questions)') IS NULL
     OR to_regprocedure('fq6_test.daily_question_technically_valid(public.questions)') IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ISOLATED_BOOTSTRAP_SIGNATURE_INVALID';
  END IF;
END $$;
ALTER TABLE fq6_test.daily_challenges DROP CONSTRAINT daily_challenges_five_unique_questions;
ALTER TABLE fq6_test.daily_challenges ADD CONSTRAINT daily_challenges_five_unique_questions
 CHECK(fq6_test.daily_question_ids_valid(question_ids)) NOT VALID;
CREATE TRIGGER questions_guard_approval BEFORE INSERT OR UPDATE ON fq6_test.questions
 FOR EACH ROW EXECUTE FUNCTION fq6_test.guard_question_approval();
CREATE TRIGGER daily_challenges_guard_rows BEFORE INSERT OR UPDATE OR DELETE ON fq6_test.daily_challenges
 FOR EACH ROW EXECUTE FUNCTION fq6_test.guard_published_daily_challenge();
CREATE TRIGGER daily_challenges_guard_truncate BEFORE TRUNCATE ON fq6_test.daily_challenges
 FOR EACH STATEMENT EXECUTE FUNCTION fq6_test.guard_published_daily_challenge();
ALTER TABLE fq6_test.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fq6_test.quiz_attempt_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA fq6_test FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fq6_test FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA fq6_test TO service_role,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fq6_test TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA fq6_test TO service_role;
GRANT INSERT ON fq6_test.daily_challenges,fq6_test.quiz_attempts,fq6_test.quiz_attempt_answers,fq6_test.quiz_results TO service_role;
GRANT UPDATE(completed_at) ON fq6_test.quiz_attempts TO service_role;
-- Emergency postgres TRUNCATE: ONLY empty copied tables, never public.
TRUNCATE fq6_test.quiz_results,fq6_test.quiz_attempt_answers,fq6_test.quiz_attempts,fq6_test.daily_challenges;
CREATE FUNCTION pg_temp.assert_true(ok BOOLEAN, label TEXT) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'PASS: %', label;
END $$;
CREATE FUNCTION pg_temp.expect_error(command TEXT, expected_state TEXT, expected_message TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE actual_state TEXT; actual_message TEXT;
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_message = MESSAGE_TEXT;
  END;
  IF actual_state IS DISTINCT FROM expected_state
     OR (expected_message IS NOT NULL AND actual_message IS DISTINCT FROM expected_message) THEN
    RAISE EXCEPTION 'Expected % / %, got % / %: %', expected_state, expected_message, actual_state, actual_message, command;
  END IF;
  RAISE NOTICE 'PASS expected error: % / %', expected_state, expected_message;
END $$;

INSERT INTO fq6_test.questions(id, category, difficulty, question, options, correct_index, explanation, tags)
SELECT ('f1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'world_cup', 1, 'Fixture ' || n, '["A","B","C","D"]'::jsonb, 1, 'Fixture explanation', ARRAY['test']
FROM generate_series(1,6) n;
INSERT INTO fq6_test.daily_challenges(id, date, question_ids) VALUES (
 'f2000000-0000-4000-8000-000000000001', DATE '2040-01-01',
 ARRAY['f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000005']::uuid[]
);

SET LOCAL ROLE service_role;
INSERT INTO fq6_test.quiz_attempts(id, challenge_id, anonymous_token_hash)
VALUES ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',repeat('a',64));
SELECT pg_temp.assert_true((SELECT started_at IS NOT NULL AND completed_at IS NULL FROM fq6_test.quiz_attempts
 WHERE id='f3000000-0000-4000-8000-000000000001'), 'create attempt as service_role');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000001',repeat('a',64))$q$, '23505');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000099',repeat('b',64))$q$, '23503');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000001','invalid')$q$, '23514');

DO $$
DECLARE i INTEGER; owner_hash TEXT; name TEXT; first JSONB; retry JSONB;
BEGIN
  FOREACH i IN ARRAY ARRAY[-2,4,100000,NULL] LOOP
    PERFORM pg_temp.expect_error(format('SELECT fq6_test.record_quiz_attempt_answer(%L,%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',i),
      'P0001','INVALID_SELECTED_INDEX');
  END LOOP;
  FOREACH owner_hash IN ARRAY ARRAY[repeat('b',64),NULL] LOOP
    PERFORM pg_temp.expect_error(format('SELECT fq6_test.record_quiz_attempt_answer(%L,%L,%L,1)',
      'f3000000-0000-4000-8000-000000000001',owner_hash,'f1000000-0000-4000-8000-000000000003'), 'P0001','ATTEMPT_FORBIDDEN');
    PERFORM pg_temp.expect_error(format('SELECT fq6_test.finish_quiz_attempt(%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',owner_hash,'Test'), 'P0001','ATTEMPT_FORBIDDEN');
  END LOOP;
  FOREACH name IN ARRAY ARRAY[NULL,'','   ',E'\t\n',repeat('x',21)] LOOP
    PERFORM pg_temp.expect_error(format('SELECT fq6_test.finish_quiz_attempt(%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',repeat('a',64),name), 'P0001','INVALID_USERNAME');
  END LOOP;
  PERFORM pg_temp.expect_error($q$SELECT fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000006',1)$q$, 'P0001','QUESTION_NOT_IN_CHALLENGE');
  PERFORM pg_temp.expect_error($q$SELECT fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000001',1)$q$, 'P0001','QUESTION_OUT_OF_ORDER');
  first := fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1);
  retry := fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1);
  PERFORM pg_temp.assert_true(first->>'correct'='true' AND first->>'replayed'='false', 'first correct answer');
  PERFORM pg_temp.assert_true((first-'replayed')=(retry-'replayed') AND retry->>'replayed'='true', 'retry preserves answer and timestamp');
  PERFORM pg_temp.expect_error($q$SELECT fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',0)$q$, 'P0001','ANSWER_ALREADY_RECORDED');
END $$;
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',1,true,now())$q$,'23505');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',-1,true,now())$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',4,false,now())$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000099','f1000000-0000-4000-8000-000000000001',0,false,now())$q$,'23503');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000099',0,false,now())$q$,'23503');
SELECT pg_temp.expect_error($q$SELECT fq6_test.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),'Test')$q$,'P0001','ATTEMPT_INCOMPLETE');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM fq6_test.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000001'), 'incomplete finish inserts nothing');
SELECT pg_temp.assert_true((fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000001',0)->>'correct')='false', 'wrong answer');
SELECT pg_temp.assert_true((fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000002',-1)->>'correct')='false', 'timeout answer');
SELECT pg_temp.assert_true((fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000004',1)->>'correct')='true','fourth correct');
SELECT pg_temp.assert_true((fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000005',-1)->>'correct')='false','fifth timeout');
DO $$
DECLARE first JSONB; retry JSONB; completed TIMESTAMPTZ;
BEGIN
 first := fq6_test.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),'  Test  ');
 SELECT completed_at INTO completed FROM fq6_test.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000001';
 retry := fq6_test.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),NULL);
 PERFORM pg_temp.assert_true(first->'result'=retry->'result' AND retry->>'replayed'='true', 'finish retry returns exact same result');
 PERFORM pg_temp.assert_true(first#>>'{result,score}'='2' AND first#>>'{result,total_questions}'='5'
   AND first#>>'{result,answers_pattern}'='10010', 'score and canonical non-UUID-sorted pattern');
 PERFORM pg_temp.assert_true(first#>>'{result,username}'='Test' AND first#>>'{result,attempt_id}'='f3000000-0000-4000-8000-000000000001', 'username and attempt FK');
 PERFORM pg_temp.assert_true(first#>>'{result,played_at}'=DATE '2040-01-01'::text, 'played date');
 PERFORM pg_temp.assert_true(completed IS NOT NULL AND completed=(SELECT completed_at FROM fq6_test.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000001'), 'completion timestamp stable');
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM fq6_test.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000001'), 'one result');
SELECT pg_temp.expect_error($q$SELECT fq6_test.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1)$q$,'P0001','ATTEMPT_COMPLETED');
SELECT pg_temp.expect_error($q$SELECT fq6_test.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('b',64),'Test')$q$,'P0001','ATTEMPT_FORBIDDEN');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_results(attempt_id,score,total_questions) VALUES ('f3000000-0000-4000-8000-000000000001',1,5)$q$,'23505');
SELECT pg_temp.expect_error($q$INSERT INTO fq6_test.quiz_results(attempt_id,score,total_questions) VALUES ('f3000000-0000-4000-8000-000000000099',1,5)$q$,'23503');
-- Compatibility: multiple legacy results with NULL attempt_id remain possible.
INSERT INTO fq6_test.quiz_results(username,score,total_questions) VALUES ('legacy-test',0,5),('legacy-test',0,5);
SELECT pg_temp.expect_error($q$UPDATE fq6_test.quiz_attempt_answers SET selected_index=0 WHERE attempt_id='f3000000-0000-4000-8000-000000000001'$q$,'42501');
SELECT pg_temp.expect_error($q$DELETE FROM fq6_test.quiz_attempt_answers WHERE attempt_id='f3000000-0000-4000-8000-000000000001'$q$,'42501');
RESET ROLE;

-- Verify ONLY reconstructed isolated ACLs, NOT real public ACLs.
DO $$
DECLARE role_name TEXT; table_name TEXT; privilege_name TEXT;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH table_name IN ARRAY ARRAY['fq6_test.quiz_attempts','fq6_test.quiz_attempt_answers'] LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,table_name,privilege_name), role_name||' denied '||privilege_name||' on '||table_name);
   END LOOP;
  END LOOP;
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'fq6_test.record_quiz_attempt_answer(uuid,text,uuid,integer)','EXECUTE'),role_name||' denied answer RPC');
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'fq6_test.finish_quiz_attempt(uuid,text,text)','EXECUTE'),role_name||' denied finish RPC');
 END LOOP;
 PERFORM pg_temp.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('fq6_test.quiz_attempts'::regclass,'fq6_test.quiz_attempt_answers'::regclass)), 'RLS enabled');
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM fq6_test.quiz_attempts','42501');
SELECT pg_temp.expect_error('SELECT * FROM fq6_test.quiz_attempt_answers','42501');
SELECT pg_temp.expect_error('INSERT INTO fq6_test.quiz_attempt_answers DEFAULT VALUES','42501');
SELECT pg_temp.expect_error('SELECT fq6_test.record_quiz_attempt_answer(NULL,NULL,NULL,0)','42501');
SELECT pg_temp.expect_error('SELECT fq6_test.finish_quiz_attempt(NULL,NULL,NULL)','42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT * FROM fq6_test.quiz_attempts','42501');
SELECT pg_temp.expect_error('SELECT * FROM fq6_test.quiz_attempt_answers','42501');
SELECT pg_temp.expect_error('INSERT INTO fq6_test.quiz_attempts DEFAULT VALUES','42501');
SELECT pg_temp.expect_error('SELECT fq6_test.record_quiz_attempt_answer(NULL,NULL,NULL,0)','42501');
SELECT pg_temp.expect_error('SELECT fq6_test.finish_quiz_attempt(NULL,NULL,NULL)','42501');
RESET ROLE;
ROLLBACK;
-- PASS only if all statements above completed; fixtures are now removed.

-- Prepared only. Attempt INSERT is a fixture, NOT a Next.js start endpoint test.
