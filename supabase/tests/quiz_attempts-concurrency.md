# Quiz attempts: testy wspolbieznosci i rollbacku

Procedura wylacznie dla odizolowanej, lokalnej bazy testowej po zaladowaniu
`supabase/schema.sql` i migracji `20260910120000_quiz_attempts.sql`.
Nie uzywaj produkcyjnego URL ani danych z `.env.local`. Wymagane dwa polaczenia
psql A/B jako administrator mogacy wykonac `SET ROLE service_role`.
Na czystym PostgreSQL najpierw odtworz role `anon`, `authenticated`,
`service_role NOLOGIN BYPASSRLS` oraz schemat `auth` z tabela `auth.users(id uuid primary key)`.
W lokalnym Supabase role i auth juz istnieja. Testuj przy READ COMMITTED.
Nie uruchamiaj w poblizu polnocy UTC. Testy zwykle z `quiz_attempts.sql`
wykonaj oddzielnie; koncza sie ROLLBACK.

## 1. Fixtures (administrator, raz, przed otwarciem transakcji A/B)

Fixtures sa celowo COMMITowane, aby widzialy je oba polaczenia. Po testach
koniecznie wykonaj cleanup z konca dokumentu. Precondition zabrania nadpisania
istniejacego dzisiejszego challenge. Przy konflikcie uzyj pustej bazy testowej.

```sql
BEGIN;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.daily_challenges
            WHERE date=(clock_timestamp() AT TIME ZONE 'UTC')::date) THEN
  RAISE EXCEPTION 'Use a test database without a current challenge';
 END IF;
END $$;
INSERT INTO public.questions(id,category,difficulty,question,options,correct_index,explanation,tags)
SELECT ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'world_cup',1,'Concurrency fixture '||n,'["A","B","C","D"]'::jsonb,1,'Test',ARRAY['test']
FROM generate_series(1,3) n;
INSERT INTO public.daily_challenges(id,date,question_ids) VALUES (
 'f2000000-0000-4000-8000-000000000001',(clock_timestamp() AT TIME ZONE 'UTC')::date,
 ARRAY['f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003']::uuid[]);
SET LOCAL ROLE service_role;
INSERT INTO public.quiz_attempts(id,challenge_id,anonymous_token_hash)
SELECT ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'f2000000-0000-4000-8000-000000000001',repeat(chr(96+n),64)
FROM generate_series(1,4) n;
-- Attempt 2: first two answers. Attempts 3 and 4: all answers.
DO $$ DECLARE n integer; j integer; BEGIN
 FOR n IN 2..4 LOOP
  FOR j IN 1..(CASE WHEN n=2 THEN 2 ELSE 3 END) LOOP
   PERFORM public.record_quiz_attempt_answer(
    ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat(chr(96+n),64),
    ('f1000000-0000-4000-8000-'||lpad(j::text,12,'0'))::uuid,1);
  END LOOP;
 END LOOP;
END $$;
COMMIT;
```

## 2. Dwie rozne odpowiedzi na to samo pytanie

Sesja A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT public.record_quiz_attempt_answer(
 'f3000000-0000-4000-8000-000000000001',repeat('a',64),
 'f1000000-0000-4000-8000-000000000001',0);
-- STOP: nie wykonuj jeszcze COMMIT. Wynik correct=false jest niezatwierdzony.
```

Sesja B, gdy A zwrocila JSON, ale nadal trzyma transakcje:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SET LOCAL statement_timeout = '120s';
SELECT public.record_quiz_attempt_answer(
 'f3000000-0000-4000-8000-000000000001',repeat('a',64),
 'f1000000-0000-4000-8000-000000000001',1);
-- Wywolanie ma czekac. W ciagu 120 s wykonaj COMMIT w A.
```

A: `COMMIT;`. B: oczekiwany blad P0001 / ANSWER_ALREADY_RECORDED,
bez feedbacku. W B wykonaj `ROLLBACK;` (transakcja jest przerwana).

Kontrola jako administrator:

```sql
SELECT question_id,selected_index,is_correct,answered_at
FROM public.quiz_attempt_answers
WHERE attempt_id='f3000000-0000-4000-8000-000000000001';
-- Dokladnie jeden wiersz, selected_index=0, is_correct=false.
```

## 3. Ostatnia answer rownolegle z finish

Sesja A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT public.record_quiz_attempt_answer(
 'f3000000-0000-4000-8000-000000000002',repeat('b',64),
 'f1000000-0000-4000-8000-000000000003',-1);
-- STOP przed COMMIT.
```

Sesja B:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SET LOCAL statement_timeout = '120s';
SELECT public.finish_quiz_attempt(
 'f3000000-0000-4000-8000-000000000002',repeat('b',64),'Concurrent B');
-- Czeka na A. W A wykonaj COMMIT; potem tutaj COMMIT.
```

Oczekiwany wynik B: score=2, total_questions=3, answers_pattern=110.

```sql
SELECT score,total_questions,answers_pattern,attempt_id
FROM public.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000002';
SELECT completed_at FROM public.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000002';
-- Jeden wynik 2/3, 110, completed_at NOT NULL.
```

Wariant odwrotnej kolejnosci: po cleanup i ponownym setup wykonaj finish
niekompletnej proby 2 przed ostatnia odpowiedzia. Oczekuj ATTEMPT_INCOMPLETE,
ROLLBACK; nastepnie answer i finish musza dzialac. Nie wolno zamknac proby z
niezatwierdzona/brakujaca odpowiedzia.

## 4. Dwa rownolegle finish

Sesja A:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SELECT public.finish_quiz_attempt(
 'f3000000-0000-4000-8000-000000000003',repeat('c',64),'First');
-- Zapisz result.id i result.created_at. STOP przed COMMIT.
```

Sesja B:

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL ROLE service_role;
SET LOCAL statement_timeout = '120s';
SELECT public.finish_quiz_attempt(
 'f3000000-0000-4000-8000-000000000003',repeat('c',64),'Second');
-- Czeka. A: COMMIT. B: ten sam result (rowniez username=First), replayed=true.
COMMIT;
```

```sql
SELECT count(*),min(username),min(score),min(answers_pattern)
FROM public.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000003';
-- 1, First, 3, 111.
SELECT id,created_at FROM public.quiz_results
WHERE attempt_id='f3000000-0000-4000-8000-000000000003';
-- Porownaj z JSON sesji A i B: identyczny rekord.
```

## 5. Rollback po INSERT wyniku, przed completed_at

Tylko baza testowa. Testowy trigger istnieje jedynie w ponizszej transakcji;
nie jest czescia migracji ani hardeningiem edycji pytan. Uruchom jako administrator.

```sql
BEGIN;
CREATE FUNCTION pg_temp.fail_attempt_completion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id='f3000000-0000-4000-8000-000000000004'::uuid THEN
  IF NOT EXISTS (SELECT 1 FROM public.quiz_results WHERE attempt_id=NEW.id) THEN
   RAISE EXCEPTION 'TEST_INSERT_NOT_REACHED';
  END IF;
  RAISE EXCEPTION 'TEST_FAILURE_AFTER_RESULT_INSERT';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER test_fail_completion BEFORE UPDATE OF completed_at ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_attempt_completion();
SET LOCAL ROLE service_role;
DO $$
DECLARE message text; failed boolean := false;
BEGIN
 BEGIN
  PERFORM public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000004',repeat('d',64),'Rollback');
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS message = MESSAGE_TEXT;
  IF message <> 'TEST_FAILURE_AFTER_RESULT_INSERT' THEN RAISE; END IF;
  failed := true;
 END;
 IF NOT failed THEN RAISE EXCEPTION 'Expected injected failure'; END IF;
 IF EXISTS (SELECT 1 FROM public.quiz_results WHERE attempt_id='f3000000-0000-4000-8000-000000000004')
 OR EXISTS (SELECT 1 FROM public.quiz_attempts WHERE id='f3000000-0000-4000-8000-000000000004' AND completed_at IS NOT NULL)
 OR (SELECT count(*) FROM public.quiz_attempt_answers WHERE attempt_id='f3000000-0000-4000-8000-000000000004') <> 3 THEN
  RAISE EXCEPTION 'Atomic rollback failed';
 END IF;
 RAISE NOTICE 'PASS rollback after INSERT; existing answers retained';
END $$;
ROLLBACK;
-- Trigger i funkcja testowa usuniete; fixture 4 pozostaje otwarty.
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.finish_quiz_attempt('f3000000-0000-4000-8000-000000000004',repeat('d',64),'Recovered');
COMMIT;
-- Oczekiwane: jeden wynik 3/3 i completed_at NOT NULL.
```

## 6. Cleanup (administrator, po zamknieciu obu transakcji)

Kasowanie tylko fixture IDs; nie uruchamiaj na bazie zawierajacej realne dane.

```sql
BEGIN;
DELETE FROM public.quiz_results WHERE attempt_id IN (
 SELECT ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n);
DELETE FROM public.quiz_attempt_answers WHERE attempt_id IN (
 SELECT ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n);
DELETE FROM public.quiz_attempts WHERE id IN (
 SELECT ('f3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4) n);
DELETE FROM public.daily_challenges WHERE id='f2000000-0000-4000-8000-000000000001';
DELETE FROM public.questions WHERE id IN (
 SELECT ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,3) n);
COMMIT;
```

Nie traktuj parsowania SQL ani testow z mockiem jako potwierdzenia blokad.
Sukces tych scenariuszy wymaga prawdziwych, oddzielnych polaczen PostgreSQL.
