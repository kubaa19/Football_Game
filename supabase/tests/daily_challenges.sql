-- SECTION A: REAL PUBLIC SCHEMA. DEVELOPMENT ONLY, whole file as postgres.
-- Own UUIDs/dates only. No real challenge is moved, deleted or truncated.
-- On failure: ROLLBACK on SAME connection; SQL Editor cleanup not guaranteed.
BEGIN;
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Run as postgres'; END IF; END $$;
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


SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.questions'::regclass AND attname='is_approved' AND attnotnull),'approval column NOT NULL');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.daily_challenges'::regclass AND conname='daily_challenges_five_unique_questions' AND NOT convalidated),'CHECK intentionally NOT VALID');
SELECT pg_temp.assert_true(DATE '2400-06-01'<>(clock_timestamp() AT TIME ZONE 'UTC')::date AND NOT EXISTS(SELECT 1 FROM public.daily_challenges WHERE date IN (DATE '2400-06-01',DATE '2400-06-02')),'fixture dates free');
-- UUID/date collision must abort; never use ON CONFLICT to overwrite a fixture.
INSERT INTO public.questions(id,category,difficulty,question,options,correct_index,explanation,tags)
SELECT ('f6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'world_cup',1,'Stage6 fixture '||n,
 '["A","B","C","D"]'::jsonb,1,'Fixture',ARRAY['test'] FROM generate_series(1,5)n;
SELECT pg_temp.assert_true((SELECT bool_and(NOT is_approved) FROM public.questions WHERE id BETWEEN 'f6100000-0000-4000-8000-000000000001' AND 'f6100000-0000-4000-8000-000000000005'),'default unapproved');
INSERT INTO public.daily_challenges(id,date,question_ids) VALUES ('f6200000-0000-4000-8000-000000000001',DATE '2400-06-01',
 ARRAY(SELECT ('f6100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,5)n));
DO $$ DECLARE a JSONB; b JSONB; BEGIN
 a:=public.ensure_daily_challenge(DATE '2400-06-01'); b:=public.ensure_daily_challenge(DATE '2400-06-01');
 PERFORM pg_temp.assert_true(a=b AND a->>'created'='false','existing challenge preserved despite unapproved questions');
END $$;
SELECT pg_temp.expect_error($q$INSERT INTO public.daily_challenges(date,question_ids) VALUES (DATE '2400-06-02',ARRAY[]::uuid[])$q$,'23514');
SELECT pg_temp.assert_true(NOT public.daily_question_ids_valid(ARRAY[NULL,NULL,NULL,NULL,NULL]::uuid[]),'NULL IDs rejected');
SELECT pg_temp.assert_true(NOT public.daily_question_ids_valid(array_fill('f6100000-0000-4000-8000-000000000001'::uuid,ARRAY[5])),'duplicate IDs rejected');
UPDATE public.questions SET is_approved=true WHERE id='f6100000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT is_approved FROM public.questions WHERE id='f6100000-0000-4000-8000-000000000001'),'operator approval');
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(public.ensure_daily_challenge(DATE '2400-06-01')->>'created'='false','real service_role publisher replay');
SELECT pg_temp.assert_true(NOT has_table_privilege(current_user,'public.daily_challenges','UPDATE') AND NOT has_any_column_privilege(current_user,'public.daily_challenges','UPDATE') AND NOT has_table_privilege(current_user,'public.daily_challenges','DELETE') AND NOT has_table_privilege(current_user,'public.daily_challenges','TRUNCATE'),'service_role destructive privileges absent');
SELECT pg_temp.expect_error($q$UPDATE public.daily_challenges SET date=DATE '2400-06-02' WHERE id='f6200000-0000-4000-8000-000000000001'$q$,'42501');
SELECT pg_temp.expect_error($q$DELETE FROM public.daily_challenges WHERE id='f6200000-0000-4000-8000-000000000001'$q$,'42501');
INSERT INTO public.quiz_attempts(id,challenge_id,anonymous_token_hash) VALUES ('f6300000-0000-4000-8000-000000000001','f6200000-0000-4000-8000-000000000001',repeat('6',64));
SELECT pg_temp.expect_error($q$SELECT public.record_quiz_attempt_answer('f6300000-0000-4000-8000-000000000001',repeat('6',64),'f6100000-0000-4000-8000-000000000001',1)$q$,'P0001','ATTEMPT_EXPIRED');
SELECT pg_temp.expect_error($q$SELECT public.finish_quiz_attempt('f6300000-0000-4000-8000-000000000001',repeat('6',64),'Test')$q$,'P0001','ATTEMPT_EXPIRED');
RESET ROLE;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  PERFORM pg_temp.assert_true(NOT has_function_privilege(r,'public.ensure_daily_challenge(date)','EXECUTE') AND NOT has_function_privilege(r,'public.ensure_daily_challenge_window(date,integer)','EXECUTE'),r||' RPC denied');
  EXECUTE format('SET LOCAL ROLE %I',r);
  PERFORM pg_temp.expect_error('SELECT public.ensure_daily_challenge(DATE ''2400-06-02'')','42501');
  PERFORM pg_temp.expect_error($q$INSERT INTO public.questions(id,category,question,options,is_approved) VALUES ('f6100000-0000-4000-8000-000000000099','world_cup','Forbidden','[]',true)$q$,'42501');
  -- RLS may hide the fixture: zero updated rows is a valid denial of approval.
  BEGIN
   UPDATE public.questions SET is_approved=true WHERE id='f6100000-0000-4000-8000-000000000002';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.assert_true((SELECT NOT is_approved FROM public.questions WHERE id='f6100000-0000-4000-8000-000000000002'),r||' cannot approve existing fixture');
 END LOOP;
END $$;
-- Remove ONLY own attempt so its FK does not block own emergency challenge DELETE.
DELETE FROM public.quiz_attempts WHERE id='f6300000-0000-4000-8000-000000000001';
UPDATE public.daily_challenges SET date=DATE '2400-06-02' WHERE id='f6200000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT date=DATE '2400-06-02' FROM public.daily_challenges WHERE id='f6200000-0000-4000-8000-000000000001'),'operator UPDATE');
DELETE FROM public.daily_challenges WHERE id='f6200000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.daily_challenges WHERE id='f6200000-0000-4000-8000-000000000001'),'operator DELETE');
-- NEVER TRUNCATE public. TRUNCATE is tested only in the isolated section.
ROLLBACK;

-- SECTION B follows: independent transaction, copied model only.
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


DO $$ DECLARE q fq6_test.questions%ROWTYPE; BEGIN
 q.difficulty:=1; q.correct_index:=0; q.question:='Fixture'; q.explanation:='Fixture'; q.options:='["A","B","C","D"]';
 PERFORM pg_temp.assert_true(fq6_test.daily_question_technically_valid(q),'valid technical composite');
 q.correct_index:=NULL; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'NULL correct index');
 q.correct_index:=4; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'out of range index');
 q.correct_index:=0; q.difficulty:=4; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'invalid difficulty');
 q.difficulty:=1; q.explanation:='   '; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'empty explanation');
 q.explanation:='Fixture'; q.question:=''; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'empty question');
 q.question:='Fixture'; q.options:='{}'; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'non-array options');
 q.options:='["A"," a ","C","D"]'; PERFORM pg_temp.assert_true(NOT fq6_test.daily_question_technically_valid(q),'normalized duplicate option');
END $$;
SELECT pg_temp.expect_error('SELECT fq6_test.ensure_daily_challenge(NULL)','P0001','INVALID_PUBLICATION_DATE');
SELECT pg_temp.expect_error('SELECT fq6_test.ensure_daily_challenge_window(DATE ''2040-01-01'',0)','P0001','INVALID_PUBLICATION_WINDOW');
DO $$ DECLARE n INTEGER; BEGIN
 FOR n IN 0..4 LOOP
  PERFORM pg_temp.expect_error('SELECT fq6_test.ensure_daily_challenge(DATE ''2040-01-01'')','P0001','INSUFFICIENT_ELIGIBLE_QUESTIONS');
  PERFORM pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM fq6_test.daily_challenges),'0-4: no partial challenge');
  INSERT INTO fq6_test.questions(id,category,difficulty,question,options,correct_index,explanation,tags,is_approved)
  VALUES (('f6400000-0000-4000-8000-'||lpad((n+1)::text,12,'0'))::uuid,'world_cup',1,'Fixture '||n,'["A","B","C","D"]',1,'Fixture',ARRAY['test'],true);
 END LOOP;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE a JSONB; b JSONB; expected UUID[]; BEGIN
 a:=fq6_test.ensure_daily_challenge(DATE '2040-01-01'); b:=fq6_test.ensure_daily_challenge(DATE '2040-01-01');
 PERFORM pg_temp.assert_true(a->>'created'='true' AND b->>'created'='false' AND (a-'created')=(b-'created'),'publish/retry stable');
 SELECT array_agg(id ORDER BY md5('2040-01-01:'||id::text),id) INTO expected FROM fq6_test.questions;
 PERFORM pg_temp.assert_true(a->'questionIds'=to_jsonb(expected),'deterministic five');
 PERFORM pg_temp.assert_true(NOT (a ?| ARRAY['correct_index','explanation']),'no feedback exposed');
 PERFORM pg_temp.assert_true(jsonb_array_length(fq6_test.ensure_daily_challenge_window(DATE '2040-02-01',8)->'challenges')=8,'five questions support eight days');
END $$;
RESET ROLE;
INSERT INTO fq6_test.questions(id,category,difficulty,question,options,correct_index,explanation,is_approved) VALUES
 ('f6400000-0000-4000-8000-000000000006','world_cup',1,'Draft','["A","B","C","D"]',1,'Fixture',false),
 ('f6400000-0000-4000-8000-000000000007','world_cup',1,'Bad options','["A",null,3,"D"]',1,'Fixture',true);
SELECT fq6_test.ensure_daily_challenge(DATE '2040-03-01');
SELECT pg_temp.assert_true((SELECT NOT(question_ids && ARRAY['f6400000-0000-4000-8000-000000000006','f6400000-0000-4000-8000-000000000007']::uuid[]) FROM fq6_test.daily_challenges WHERE date=DATE '2040-03-01'),'draft/bad skipped');
UPDATE fq6_test.questions SET is_approved=true WHERE id='f6400000-0000-4000-8000-000000000006';
DO $$ DECLARE expected UUID[]; a JSONB; BEGIN
 SELECT array_agg(id ORDER BY sort_key,id) INTO expected FROM (
  SELECT q.id,md5('2040-04-01:'||q.id::text) sort_key FROM fq6_test.questions q
  WHERE q.is_approved AND fq6_test.daily_question_technically_valid(q) ORDER BY sort_key,q.id LIMIT 5) s;
 a:=fq6_test.ensure_daily_challenge(DATE '2040-04-01');
 PERFORM pg_temp.assert_true(a->'questionIds'=to_jsonb(expected),'>5 deterministic choice');
END $$;
-- Existing corrupt reference: valid array shape but no matching questions.
INSERT INTO fq6_test.daily_challenges(date,question_ids) VALUES (DATE '2040-05-03',
 ARRAY(SELECT ('f6500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,5)n));
SELECT pg_temp.expect_error('SELECT fq6_test.ensure_daily_challenge(DATE ''2040-05-03'')','P0001','DAILY_CHALLENGE_INVALID');
SELECT pg_temp.expect_error('SELECT fq6_test.ensure_daily_challenge_window(DATE ''2040-05-01'',8)','P0001','DAILY_CHALLENGE_INVALID');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM fq6_test.daily_challenges WHERE date IN(DATE '2040-05-01',DATE '2040-05-02')),'batch rollback undoes preceding INSERTs');
-- Broad grants ONLY in copied model prove trigger behavior independently of ACL denial.
GRANT SELECT,INSERT,UPDATE ON fq6_test.questions TO anon,authenticated;
GRANT UPDATE,DELETE,TRUNCATE ON fq6_test.daily_challenges TO service_role;
GRANT TRUNCATE ON fq6_test.quiz_results,fq6_test.quiz_attempt_answers,fq6_test.quiz_attempts TO service_role;
DO $$ DECLARE r TEXT; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',r);
  PERFORM pg_temp.expect_error($q$UPDATE fq6_test.questions SET is_approved=false WHERE id='f6400000-0000-4000-8000-000000000001'$q$,'42501','QUESTION_APPROVAL_FORBIDDEN');
  PERFORM pg_temp.expect_error($q$INSERT INTO fq6_test.questions(category,question,options,is_approved) VALUES ('world_cup','x','[]',true)$q$,'42501','QUESTION_APPROVAL_FORBIDDEN');
  EXECUTE 'RESET ROLE';
 END LOOP;
END $$;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error('UPDATE fq6_test.daily_challenges SET date=DATE ''2041-01-01'' WHERE date=DATE ''2040-01-01''','P0001','DAILY_CHALLENGE_IMMUTABLE');
SELECT pg_temp.expect_error('DELETE FROM fq6_test.daily_challenges WHERE date=DATE ''2040-01-01''','P0001','DAILY_CHALLENGE_IMMUTABLE');
SELECT pg_temp.expect_error('TRUNCATE fq6_test.quiz_results,fq6_test.quiz_attempt_answers,fq6_test.quiz_attempts,fq6_test.daily_challenges','P0001','DAILY_CHALLENGE_IMMUTABLE');
RESET ROLE;
ROLLBACK;
-- Prepared, not executed. Next.js fallback and real concurrency are NOT tested.
