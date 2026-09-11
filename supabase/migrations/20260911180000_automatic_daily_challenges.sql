-- Stage 6. Review/apply as postgres. Does NOT approve content or activate Cron.
BEGIN;
ALTER TABLE public.questions ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;

CREATE FUNCTION public.daily_question_ids_valid(p_ids UUID[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT COALESCE(array_ndims(p_ids) = 1 AND array_lower(p_ids, 1) = 1
    AND cardinality(p_ids) = 5 AND (
      SELECT count(*) = 5 AND count(DISTINCT item) = 5
      FROM unnest(p_ids) AS items(item) WHERE item IS NOT NULL
    ), false);
$$;
ALTER TABLE public.daily_challenges ADD CONSTRAINT daily_challenges_five_unique_questions
  CHECK (public.daily_question_ids_valid(question_ids)) NOT VALID;

-- Minimal technical gate, NOT factual validation or a port of the JS validator.
CREATE FUNCTION public.daily_question_technically_valid(p_question public.questions)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_option JSONB; v_text TEXT; v_seen TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_question.difficulty IS NULL OR p_question.difficulty NOT BETWEEN 1 AND 3
     OR p_question.correct_index IS NULL OR p_question.correct_index NOT BETWEEN 0 AND 3
     OR p_question.question IS NULL OR p_question.question !~ '[^[:space:]]'
     OR p_question.explanation IS NULL OR p_question.explanation !~ '[^[:space:]]' THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(p_question.options) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(p_question.options) <> 4 THEN RETURN false; END IF;
  FOR v_option IN SELECT value FROM jsonb_array_elements(p_question.options) LOOP
    IF jsonb_typeof(v_option) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_text := lower(regexp_replace(v_option #>> '{}', '^[[:space:]]+|[[:space:]]+$', '', 'g'));
    IF v_text = '' OR v_text = ANY(v_seen) THEN RETURN false; END IF;
    v_seen := array_append(v_seen, v_text);
  END LOOP;
  RETURN true;
END;
$$;

-- Trigger is necessary even if a pre-existing table-level grant includes approval.
-- Content changes remain possible: question immutability/versioning is DEFERRED.
CREATE FUNCTION public.guard_question_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.is_approved IS DISTINCT FROM false THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'QUESTION_APPROVAL_FORBIDDEN';
      END IF;
    ELSIF NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'QUESTION_APPROVAL_FORBIDDEN';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER questions_guard_approval BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.guard_question_approval();

CREATE FUNCTION public.guard_published_daily_challenge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  -- Explicit operator exception; NOT exposed through a repair RPC.
  -- Normal FK/CHECK constraints still apply to emergency maintenance.
  IF current_user = 'postgres' THEN
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_CHALLENGE_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF current_user <> 'service_role' OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.date IS DISTINCT FROM OLD.date OR NEW.question_ids IS DISTINCT FROM OLD.question_ids THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_CHALLENGE_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DAILY_CHALLENGE_PUBLICATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER daily_challenges_guard_rows BEFORE INSERT OR UPDATE OR DELETE ON public.daily_challenges
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_daily_challenge();
CREATE TRIGGER daily_challenges_guard_truncate BEFORE TRUNCATE ON public.daily_challenges
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_published_daily_challenge();

CREATE FUNCTION public.ensure_daily_challenge(p_date DATE)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_challenge public.daily_challenges%ROWTYPE; v_ids UUID[];
        v_found_count INTEGER; v_created BOOLEAN := false;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DAILY_CHALLENGE_PUBLICATION_FORBIDDEN';
  END IF;
  IF p_date IS NULL OR NOT isfinite(p_date) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PUBLICATION_DATE';
  END IF;
  PERFORM pg_advisory_xact_lock(610006, p_date - DATE '2000-01-01');
  SELECT d.* INTO v_challenge FROM public.daily_challenges d WHERE d.date = p_date;
  IF NOT FOUND THEN
    SELECT array_agg(candidate.id ORDER BY candidate.sort_key, candidate.id) INTO v_ids
    FROM (
      SELECT q.id, md5(to_char(p_date, 'YYYY-MM-DD') || ':' || q.id::TEXT) AS sort_key
      FROM public.questions q
      WHERE q.is_approved = true AND public.daily_question_technically_valid(q)
      ORDER BY sort_key, q.id LIMIT 5
    ) candidate;
    IF NOT public.daily_question_ids_valid(v_ids) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_ELIGIBLE_QUESTIONS';
    END IF;
    INSERT INTO public.daily_challenges(date, question_ids) VALUES (p_date, v_ids)
      ON CONFLICT (date) DO NOTHING RETURNING * INTO v_challenge;
    v_created := FOUND;
    IF NOT v_created THEN
      SELECT d.* INTO v_challenge FROM public.daily_challenges d WHERE d.date = p_date;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_CHALLENGE_PUBLICATION_CONFLICT';
      END IF;
    END IF;
  END IF;
  -- Never require approval retroactively or reroll an existing challenge.
  IF NOT public.daily_question_ids_valid(v_challenge.question_ids) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_CHALLENGE_INVALID';
  END IF;
  SELECT count(*) INTO v_found_count FROM public.questions q WHERE q.id = ANY(v_challenge.question_ids);
  IF v_found_count <> 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'DAILY_CHALLENGE_INVALID';
  END IF;
  RETURN jsonb_build_object('challengeId', v_challenge.id, 'challengeDate', v_challenge.date,
    'questionIds', to_jsonb(v_challenge.question_ids), 'created', v_created);
END;
$$;

-- All-or-nothing window: exceptions are deliberately NOT swallowed.
CREATE FUNCTION public.ensure_daily_challenge_window(p_start_date DATE, p_days INTEGER DEFAULT 8)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_offset INTEGER; v_results JSONB := '[]'::JSONB;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'DAILY_CHALLENGE_PUBLICATION_FORBIDDEN';
  END IF;
  IF p_start_date IS NULL OR NOT isfinite(p_start_date) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PUBLICATION_DATE';
  END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 14 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PUBLICATION_WINDOW';
  END IF;
  FOR v_offset IN 0..(p_days - 1) LOOP
    v_results := v_results || jsonb_build_array(public.ensure_daily_challenge(p_start_date + v_offset));
  END LOOP;
  RETURN jsonb_build_object('challenges', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.daily_question_ids_valid(UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.daily_question_technically_valid(public.questions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_question_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_published_daily_challenge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_daily_challenge(DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_daily_challenge_window(DATE, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT ON public.questions TO service_role;
-- Remove pre-existing table AND column write grants; do not rely on REVOKE column alone.
REVOKE UPDATE, DELETE, TRUNCATE ON public.daily_challenges FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE col RECORD;
BEGIN
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid = 'public.daily_challenges'::regclass AND attnum > 0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE UPDATE (%I) ON public.daily_challenges FROM PUBLIC, anon, authenticated, service_role', col.attname);
  END LOOP;
END;
$$;
GRANT SELECT, INSERT ON public.daily_challenges TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_question_ids_valid(UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.daily_question_technically_valid(public.questions) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_daily_challenge(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_daily_challenge_window(DATE, INTEGER) TO service_role;
REVOKE INSERT (is_approved), UPDATE (is_approved) ON public.questions FROM PUBLIC, anon, authenticated;
-- RLS unchanged. Existing service_role BYPASSRLS is required for its invoker access.
-- No automatic approval, VALIDATE CONSTRAINT, content freeze or scheduler activation.
COMMIT;
