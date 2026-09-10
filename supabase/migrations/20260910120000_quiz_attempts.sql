-- Additive migration. Existing result writers may continue using attempt_id = NULL.
BEGIN;
CREATE TABLE public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.daily_challenges(id) ON DELETE RESTRICT,
  anonymous_token_hash TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  CONSTRAINT quiz_attempts_owner_challenge_unique UNIQUE (anonymous_token_hash, challenge_id),
  CONSTRAINT quiz_attempts_hash_format CHECK (anonymous_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT quiz_attempts_completion_time CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE INDEX quiz_attempts_challenge_idx ON public.quiz_attempts(challenge_id);
CREATE TABLE public.quiz_attempt_answers (
  attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE RESTRICT,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  selected_index SMALLINT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quiz_attempt_answers_pkey PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT quiz_attempt_answers_index_range CHECK (selected_index BETWEEN -1 AND 3),
  CONSTRAINT quiz_attempt_answers_timeout CHECK (selected_index <> -1 OR is_correct = false)
);
CREATE INDEX quiz_attempt_answers_question_idx ON public.quiz_attempt_answers(question_id);
ALTER TABLE public.quiz_results ADD COLUMN attempt_id UUID NULL;
ALTER TABLE public.quiz_results
  ADD CONSTRAINT quiz_results_attempt_fk FOREIGN KEY (attempt_id) REFERENCES public.quiz_attempts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT quiz_results_attempt_unique UNIQUE (attempt_id);

CREATE FUNCTION public.record_quiz_attempt_answer(
  p_attempt_id UUID, p_owner_hash TEXT, p_question_id UUID, p_selected_index INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_attempt public.quiz_attempts%ROWTYPE;
  v_challenge public.daily_challenges%ROWTYPE;
  v_existing public.quiz_attempt_answers%ROWTYPE;
  v_question public.questions%ROWTYPE;
  v_next_question_id UUID;
  v_is_correct BOOLEAN;
  v_answered_at TIMESTAMPTZ;
  v_today DATE;
  v_count INTEGER;
BEGIN
  IF p_attempt_id IS NULL OR p_question_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_ARGUMENT';
  END IF;
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN -1 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_SELECTED_INDEX';
  END IF;
  SELECT a.* INTO v_attempt FROM public.quiz_attempts a WHERE a.id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_NOT_FOUND'; END IF;
  IF p_owner_hash IS DISTINCT FROM v_attempt.anonymous_token_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_FORBIDDEN';
  END IF;
  IF v_attempt.completed_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_COMPLETED';
  END IF;
  SELECT c.* INTO v_challenge FROM public.daily_challenges c WHERE c.id = v_attempt.challenge_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHALLENGE_INVALID'; END IF;
  v_today := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  IF v_challenge.date <> v_today THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_EXPIRED'; END IF;
  v_count := cardinality(v_challenge.question_ids);
  IF v_count IS NULL OR v_count = 0 OR array_ndims(v_challenge.question_ids) <> 1
     OR EXISTS (SELECT 1 FROM unnest(v_challenge.question_ids) q(id) WHERE q.id IS NULL)
     OR (SELECT count(DISTINCT q.id) FROM unnest(v_challenge.question_ids) q(id)) <> v_count
     OR (SELECT count(*) FROM public.questions q WHERE q.id = ANY(v_challenge.question_ids)) <> v_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHALLENGE_INVALID';
  END IF;
  IF NOT (p_question_id = ANY(v_challenge.question_ids)) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUESTION_NOT_IN_CHALLENGE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quiz_attempt_answers a WHERE a.attempt_id = p_attempt_id
             AND NOT (a.question_id = ANY(v_challenge.question_ids))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_DATA_INVALID';
  END IF;
  SELECT a.* INTO v_existing FROM public.quiz_attempt_answers a
    WHERE a.attempt_id = p_attempt_id AND a.question_id = p_question_id;
  IF FOUND THEN
    IF v_existing.selected_index <> p_selected_index THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ANSWER_ALREADY_RECORDED';
    END IF;
    SELECT q.* INTO v_question FROM public.questions q WHERE q.id = p_question_id;
    IF NOT FOUND OR v_question.correct_index IS NULL OR v_question.correct_index NOT BETWEEN 0 AND 3 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUESTION_DATA_INVALID';
    END IF;
    RETURN jsonb_build_object('questionId', p_question_id, 'selectedIndex', v_existing.selected_index,
      'correct', v_existing.is_correct, 'correctIndex', v_question.correct_index,
      'explanation', coalesce(v_question.explanation, ''), 'answeredAt', v_existing.answered_at, 'replayed', true);
  END IF;
  SELECT q.id INTO v_next_question_id
    FROM unnest(v_challenge.question_ids) WITH ORDINALITY q(id, position)
    WHERE NOT EXISTS (SELECT 1 FROM public.quiz_attempt_answers a
                      WHERE a.attempt_id = p_attempt_id AND a.question_id = q.id)
    ORDER BY q.position LIMIT 1;
  IF p_question_id IS DISTINCT FROM v_next_question_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUESTION_OUT_OF_ORDER';
  END IF;
  SELECT q.* INTO v_question FROM public.questions q WHERE q.id = p_question_id;
  IF NOT FOUND OR v_question.correct_index IS NULL OR v_question.correct_index NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'QUESTION_DATA_INVALID';
  END IF;
  v_is_correct := p_selected_index <> -1 AND p_selected_index = v_question.correct_index;
  v_answered_at := clock_timestamp();
  INSERT INTO public.quiz_attempt_answers(attempt_id, question_id, selected_index, is_correct, answered_at)
    VALUES (p_attempt_id, p_question_id, p_selected_index, v_is_correct, v_answered_at);
  RETURN jsonb_build_object('questionId', p_question_id, 'selectedIndex', p_selected_index,
    'correct', v_is_correct, 'correctIndex', v_question.correct_index,
    'explanation', coalesce(v_question.explanation, ''), 'answeredAt', v_answered_at, 'replayed', false);
END;
$$;

CREATE FUNCTION public.finish_quiz_attempt(p_attempt_id UUID, p_owner_hash TEXT, p_username TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE
  v_attempt public.quiz_attempts%ROWTYPE;
  v_challenge public.daily_challenges%ROWTYPE;
  v_result public.quiz_results%ROWTYPE;
  v_username TEXT;
  v_total INTEGER;
  v_answer_count INTEGER;
  v_score INTEGER;
  v_pattern TEXT;
  v_today DATE;
BEGIN
  IF p_attempt_id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_ARGUMENT'; END IF;
  SELECT a.* INTO v_attempt FROM public.quiz_attempts a WHERE a.id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_NOT_FOUND'; END IF;
  IF p_owner_hash IS DISTINCT FROM v_attempt.anonymous_token_hash THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_FORBIDDEN';
  END IF;
  IF v_attempt.completed_at IS NOT NULL THEN
    SELECT r.* INTO v_result FROM public.quiz_results r WHERE r.attempt_id = p_attempt_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_RESULT_MISSING'; END IF;
    RETURN jsonb_build_object('success', true, 'result', to_jsonb(v_result), 'replayed', true);
  END IF;
  v_username := regexp_replace(p_username, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  IF v_username IS NULL OR char_length(v_username) NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_USERNAME';
  END IF;
  SELECT c.* INTO v_challenge FROM public.daily_challenges c WHERE c.id = v_attempt.challenge_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHALLENGE_INVALID'; END IF;
  v_today := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  IF v_challenge.date <> v_today THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_EXPIRED'; END IF;
  v_total := cardinality(v_challenge.question_ids);
  IF v_total IS NULL OR v_total = 0 OR v_total > 32767 OR array_ndims(v_challenge.question_ids) <> 1
     OR EXISTS (SELECT 1 FROM unnest(v_challenge.question_ids) q(id) WHERE q.id IS NULL)
     OR (SELECT count(DISTINCT q.id) FROM unnest(v_challenge.question_ids) q(id)) <> v_total
     OR (SELECT count(*) FROM public.questions q WHERE q.id = ANY(v_challenge.question_ids)) <> v_total THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'CHALLENGE_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM public.quiz_attempt_answers a WHERE a.attempt_id = p_attempt_id
             AND NOT (a.question_id = ANY(v_challenge.question_ids))) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_DATA_INVALID';
  END IF;
  SELECT count(*) INTO v_answer_count FROM public.quiz_attempt_answers a WHERE a.attempt_id = p_attempt_id;
  IF v_answer_count <> v_total THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_INCOMPLETE'; END IF;
  SELECT count(*) FILTER (WHERE a.is_correct),
         string_agg(CASE WHEN a.is_correct THEN '1' ELSE '0' END, '' ORDER BY q.position)
    INTO v_score, v_pattern
    FROM unnest(v_challenge.question_ids) WITH ORDINALITY q(id, position)
    JOIN public.quiz_attempt_answers a ON a.attempt_id = p_attempt_id AND a.question_id = q.id;
  IF EXISTS (SELECT 1 FROM public.quiz_results r WHERE r.attempt_id = p_attempt_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ATTEMPT_DATA_INVALID';
  END IF;
  INSERT INTO public.quiz_results(attempt_id, username, score, total_questions, answers_pattern, played_at)
    VALUES (p_attempt_id, v_username, v_score, v_total, v_pattern, v_challenge.date) RETURNING * INTO v_result;
  UPDATE public.quiz_attempts SET completed_at = clock_timestamp() WHERE id = p_attempt_id;
  RETURN jsonb_build_object('success', true, 'result', to_jsonb(v_result), 'replayed', false);
END;
$$;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempt_answers ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.quiz_attempts, public.quiz_attempt_answers FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT ON TABLE public.quiz_attempts TO service_role;
GRANT UPDATE (completed_at) ON TABLE public.quiz_attempts TO service_role;
GRANT SELECT, INSERT ON TABLE public.quiz_attempt_answers TO service_role;
GRANT SELECT ON TABLE public.daily_challenges, public.questions TO service_role;
GRANT SELECT, INSERT ON TABLE public.quiz_results TO service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.record_quiz_attempt_answer(UUID, TEXT, UUID, INTEGER) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.finish_quiz_attempt(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_quiz_attempt_answer(UUID, TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_quiz_attempt(UUID, TEXT, TEXT) TO service_role;
COMMIT;
