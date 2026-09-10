-- TEST DATABASE ONLY. Requires schema.sql + migration and Supabase roles.
-- Run as database owner: psql -X -v ON_ERROR_STOP=1 -f supabase/tests/quiz_attempts.sql
-- All fixtures and helper functions are rolled back. On failure, close the
-- connection (or ROLLBACK manually); never commit this test transaction.
-- Supabase SQL Editor connection cleanup is not assumed here.
-- After an unhandled error, ROLLBACK on the same connection or close it.
-- Refreshing a browser tab does not guarantee closing the DB connection.
-- ROLLBACK also restores the original challenge date. Avoid UTC midnight.
BEGIN;
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

-- Prevent concurrent writes from taking the selected helper date.
-- This lock lasts until ROLLBACK; ordinary SELECT remains possible.
LOCK TABLE public.daily_challenges IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  today DATE := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  helper_date DATE := DATE '2000-01-01';
BEGIN
  IF EXISTS (SELECT 1 FROM public.daily_challenges WHERE date = today) THEN
    WHILE helper_date = today OR EXISTS (
      SELECT 1 FROM public.daily_challenges WHERE date = helper_date
    ) LOOP
      helper_date := helper_date + 1;
    END LOOP;
    PERFORM pg_temp.assert_true(NOT EXISTS (
      SELECT 1 FROM public.daily_challenges WHERE date = helper_date
    ), 'helper date is free before UPDATE');
    UPDATE public.daily_challenges SET date = helper_date WHERE date = today;
  END IF;
  PERFORM pg_temp.assert_true(NOT EXISTS (
    SELECT 1 FROM public.daily_challenges WHERE date = today
  ), 'today is free before fixture INSERT');
END $$;
INSERT INTO public.questions(id, category, difficulty, question, options, correct_index, explanation, tags)
SELECT ('f1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'world_cup', 1, 'Fixture ' || n, '["A","B","C","D"]'::jsonb, 1, 'Fixture explanation', ARRAY['test']
FROM generate_series(1,4) n;
INSERT INTO public.daily_challenges(id, date, question_ids) VALUES (
 'f2000000-0000-4000-8000-000000000001', (clock_timestamp() AT TIME ZONE 'UTC')::date,
 ARRAY['f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002']::uuid[]
);

SET LOCAL ROLE service_role;
INSERT INTO public.quiz_attempts(id, challenge_id, anonymous_token_hash)
VALUES ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',repeat('a',64));
SELECT pg_temp.assert_true((SELECT started_at IS NOT NULL AND completed_at IS NULL FROM public.quiz_attempts
 WHERE id='f3000000-0000-4000-8000-000000000001'), 'create attempt as service_role');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000001',repeat('a',64))$q$, '23505');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000099',repeat('b',64))$q$, '23503');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempts(challenge_id,anonymous_token_hash)
 VALUES ('f2000000-0000-4000-8000-000000000001','invalid')$q$, '23514');

DO $$
DECLARE i INTEGER; owner_hash TEXT; name TEXT; first JSONB; retry JSONB;
BEGIN
  FOREACH i IN ARRAY ARRAY[-2,4,100000,NULL] LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.record_quiz_attempt_answer(%L,%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',i),
      'P0001','INVALID_SELECTED_INDEX');
  END LOOP;
  FOREACH owner_hash IN ARRAY ARRAY[repeat('b',64),NULL] LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.record_quiz_attempt_answer(%L,%L,%L,1)',
      'f3000000-0000-4000-8000-000000000001',owner_hash,'f1000000-0000-4000-8000-000000000003'), 'P0001','ATTEMPT_FORBIDDEN');
    PERFORM pg_temp.expect_error(format('SELECT public.finish_quiz_attempt(%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',owner_hash,'Test'), 'P0001','ATTEMPT_FORBIDDEN');
  END LOOP;
  FOREACH name IN ARRAY ARRAY[NULL,'','   ',E'\t\n',repeat('x',21)] LOOP
    PERFORM pg_temp.expect_error(format('SELECT public.finish_quiz_attempt(%L,%L,%L)',
      'f3000000-0000-4000-8000-000000000001',repeat('a',64),name), 'P0001','INVALID_USERNAME');
  END LOOP;
  PERFORM pg_temp.expect_error($q$SELECT public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000004',1)$q$, 'P0001','QUESTION_NOT_IN_CHALLENGE');
  PERFORM pg_temp.expect_error($q$SELECT public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000001',1)$q$, 'P0001','QUESTION_OUT_OF_ORDER');
  first := public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1);
  retry := public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1);
  PERFORM pg_temp.assert_true(first->>'correct'='true' AND first->>'replayed'='false', 'first correct answer');
  PERFORM pg_temp.assert_true((first-'replayed')=(retry-'replayed') AND retry->>'replayed'='true', 'retry preserves answer and timestamp');
  PERFORM pg_temp.expect_error($q$SELECT public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',0)$q$, 'P0001','ANSWER_ALREADY_RECORDED');
END $$;
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000003',1,true,now())$q$,'23505');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',-1,true,now())$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',4,false,now())$q$,'23514');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000099','f1000000-0000-4000-8000-000000000001',0,false,now())$q$,'23503');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_attempt_answers VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000099',0,false,now())$q$,'23503');
SELECT pg_temp.expect_error($q$SELECT public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),'Test')$q$,'P0001','ATTEMPT_INCOMPLETE');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000001'), 'incomplete finish inserts nothing');
SELECT pg_temp.assert_true((public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000001',0)->>'correct')='false', 'wrong answer');
SELECT pg_temp.assert_true((public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000002',-1)->>'correct')='false', 'timeout answer');
DO $$
DECLARE first JSONB; retry JSONB; completed TIMESTAMPTZ;
BEGIN
 first := public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),'  Test  ');
 SELECT completed_at INTO completed FROM public.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000001';
 retry := public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('a',64),NULL);
 PERFORM pg_temp.assert_true(first->'result'=retry->'result' AND retry->>'replayed'='true', 'finish retry returns exact same result');
 PERFORM pg_temp.assert_true(first#>>'{result,score}'='1' AND first#>>'{result,total_questions}'='3'
   AND first#>>'{result,answers_pattern}'='100', 'score and canonical non-UUID-sorted pattern');
 PERFORM pg_temp.assert_true(first#>>'{result,username}'='Test' AND first#>>'{result,attempt_id}'='f3000000-0000-4000-8000-000000000001', 'username and attempt FK');
 PERFORM pg_temp.assert_true(first#>>'{result,played_at}'=(clock_timestamp() AT TIME ZONE 'UTC')::date::text, 'played date');
 PERFORM pg_temp.assert_true(completed IS NOT NULL AND completed=(SELECT completed_at FROM public.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000001'), 'completion timestamp stable');
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000001'), 'one result');
SELECT pg_temp.expect_error($q$SELECT public.record_quiz_attempt_answer('f3000000-0000-4000-8000-000000000001',repeat('a',64),'f1000000-0000-4000-8000-000000000003',1)$q$,'P0001','ATTEMPT_COMPLETED');
SELECT pg_temp.expect_error($q$SELECT public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000001',repeat('b',64),'Test')$q$,'P0001','ATTEMPT_FORBIDDEN');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_results(attempt_id,score,total_questions) VALUES ('f3000000-0000-4000-8000-000000000001',1,3)$q$,'23505');
SELECT pg_temp.expect_error($q$INSERT INTO public.quiz_results(attempt_id,score,total_questions) VALUES ('f3000000-0000-4000-8000-000000000099',1,3)$q$,'23503');
-- Compatibility: multiple legacy results with NULL attempt_id remain possible.
INSERT INTO public.quiz_results(username,score,total_questions) VALUES ('legacy-test',0,3),('legacy-test',0,3);
SELECT pg_temp.expect_error($q$UPDATE public.quiz_attempt_answers SET selected_index=0 WHERE attempt_id='f3000000-0000-4000-8000-000000000001'$q$,'42501');
SELECT pg_temp.expect_error($q$DELETE FROM public.quiz_attempt_answers WHERE attempt_id='f3000000-0000-4000-8000-000000000001'$q$,'42501');
RESET ROLE;

-- Verify ACLs AND actual execution under both public client roles.
DO $$
DECLARE role_name TEXT; table_name TEXT; privilege_name TEXT;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH table_name IN ARRAY ARRAY['public.quiz_attempts','public.quiz_attempt_answers'] LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    PERFORM pg_temp.assert_true(NOT has_table_privilege(role_name,table_name,privilege_name), role_name||' denied '||privilege_name||' on '||table_name);
   END LOOP;
  END LOOP;
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'public.record_quiz_attempt_answer(uuid,text,uuid,integer)','EXECUTE'),role_name||' denied answer RPC');
  PERFORM pg_temp.assert_true(NOT has_function_privilege(role_name,'public.finish_quiz_attempt(uuid,text,text)','EXECUTE'),role_name||' denied finish RPC');
 END LOOP;
 PERFORM pg_temp.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.quiz_attempts'::regclass,'public.quiz_attempt_answers'::regclass)), 'RLS enabled');
END $$;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error('SELECT * FROM public.quiz_attempts','42501');
SELECT pg_temp.expect_error('SELECT * FROM public.quiz_attempt_answers','42501');
SELECT pg_temp.expect_error('INSERT INTO public.quiz_attempt_answers DEFAULT VALUES','42501');
SELECT pg_temp.expect_error('SELECT public.record_quiz_attempt_answer(NULL,NULL,NULL,0)','42501');
SELECT pg_temp.expect_error('SELECT public.finish_quiz_attempt(NULL,NULL,NULL)','42501');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error('SELECT * FROM public.quiz_attempts','42501');
SELECT pg_temp.expect_error('SELECT * FROM public.quiz_attempt_answers','42501');
SELECT pg_temp.expect_error('INSERT INTO public.quiz_attempts DEFAULT VALUES','42501');
SELECT pg_temp.expect_error('SELECT public.record_quiz_attempt_answer(NULL,NULL,NULL,0)','42501');
SELECT pg_temp.expect_error('SELECT public.finish_quiz_attempt(NULL,NULL,NULL)','42501');
RESET ROLE;
ROLLBACK;
-- PASS only if all statements above completed; fixtures are now removed.
