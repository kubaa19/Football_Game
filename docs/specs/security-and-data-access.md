# Bezpieczeństwo i dostęp do danych

## 1. Granica zaufania

FootQuiz nie ufa danym klienta jako źródłu prawdy dla wyniku ani przebiegu gry.

Niezaufane są m.in.:

- localStorage,
- stan React,
- blokady przycisków,
- score obliczony w przeglądarce,
- `answers_pattern` przesłany przez klienta,
- czas mierzony wyłącznie przez frontend.

Autorytatywny stan znajduje się po stronie serwera i PostgreSQL.

---

## 2. Klucze i klienci Supabase

### Publiczny klient

`src/lib/supabase.ts` używa:

- `NEXT_PUBLIC_SUPABASE_URL`,
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Te wartości są publiczne i dostępne w przeglądarce.

Publiczny klient nie może być traktowany jako mechanizm ochrony danych.

### Serwerowy klient

Krytyczne Route Handlers używają:

`SUPABASE_SECRET_KEY`

przez serwerowy helper `createSupabaseAdmin()`.

Klucz serwerowy:

- nie trafia do przeglądarki,
- nie jest zmienną `NEXT_PUBLIC_*`,
- jest używany wyłącznie po stronie serwera.

---

## 3. Anonymous identity

Anonimowy użytkownik jest identyfikowany przez sekret w HttpOnly cookie.

Zasady:

- sekret ma losową wartość,
- raw cookie nie jest zapisywane w DB,
- owner identity jest reprezentowane przez SHA-256 hash,
- klient nie przesyła owner hash w JSON,
- endpointy odpowiedzi i finalizacji odczytują istniejącą identity,
- nie tworzą nowej identity, jeśli cookie zniknęło.

Dzięki temu klient nie może sam zadeklarować, do której anonimowej próby należy.

### Ograniczenie

Reset cookie lub incognito może utworzyć nową anonimową identity i tym samym obejść ograniczenie jednej próby na browser identity.

Jest to zaakceptowane ograniczenie przed Auth.

---

## 4. Ochrona pytań i odpowiedzi

`GET /api/quiz/daily` zwraca tylko publiczne pola:

- `id`,
- `category`,
- `difficulty`,
- `question`,
- `options`,
- `tags`.

Nie zwraca:

- `correct_index`,
- `explanation`.

Samo pominięcie kolumn w odpowiedzi API nie zastępuje RLS/grantów. Publiczny dostęp do tabel musi być kontrolowany osobno.

---

## 5. Serwerowy zapis odpowiedzi

`POST /api/quiz/answer` przyjmuje:

- `attemptId`,
- `questionId`,
- `selectedIndex`.

Endpoint:

- waliduje format,
- wymaga istniejącego HttpOnly cookie,
- nie akceptuje owner hash,
- nie oblicza poprawności lokalnie,
- korzysta z RPC `record_quiz_attempt_answer`.

RPC:

- działa na `quiz_attempts`,
- blokuje attempt `FOR UPDATE`,
- sprawdza właściciela,
- sprawdza challenge,
- sprawdza kolejność,
- utrwala pierwszy zaakceptowany wybór,
- nie pozwala zmienić odpowiedzi,
- oblicza `is_correct` po stronie DB.

To eliminuje dawny problem „sprawdź odpowiedź, a potem wyślij poprawioną odpowiedź do wyniku”.

---

## 6. Idempotencja i immutability odpowiedzi

Dla `(attempt_id, question_id)` istnieje jeden zapis odpowiedzi.

Zasady:

- identyczny retry jest dozwolony,
- zmiana już zapisanej odpowiedzi jest odrzucana,
- timeout `-1` również jest trwałym wyborem,
- frontend nie może nadpisać zapisanego wyniku pytania.

To jest podstawowa ochrona przed retry, refresh i niepewną odpowiedzią sieciową.

---

## 7. Finalizacja wyniku

`POST /api/quiz/attempt/finish` nie ufa klientowi w zakresie wyniku.

Klient przesyła wyłącznie:

- `attemptId`,
- `username`.

Nie przesyła:

- `score`,
- `totalQuestions`,
- `answers_pattern`,
- `is_correct`.

RPC `finish_quiz_attempt`:

- blokuje attempt,
- sprawdza właściciela,
- sprawdza kompletność,
- wylicza wynik z zapisanych odpowiedzi,
- tworzy `quiz_results`,
- ustawia `completed_at`,
- robi to atomowo.

Retry zakończonej próby zwraca istniejący wynik.

---

## 8. Legacy result flow

Stare ścieżki zapisu wyniku zostały usunięte.

Nie istnieją już jako wspierany flow aplikacji:

- `/api/quiz/result`,
- `/quiz/result`,
- `saveQuizResult`.

Jedyną wspieraną ścieżką zapisu wyniku w aplikacji jest finalizacja attempts flow.

### Ważna granica

To jest gwarancja na poziomie kodu aplikacji, nie pełna gwarancja DB-level.

`service_role` nadal posiada uprawnienia potrzebne do działania RPC.

Pełny audyt grantów i ewentualne dalsze ograniczenie direct INSERT pozostaje osobnym etapem.

---

## 9. RLS i uprawnienia quiz attempts

Migracja quiz attempts:

- włącza RLS na nowych tabelach,
- nie dodaje publicznych polityk dla `anon` i `authenticated`,
- udostępnia wymagane operacje `service_role`,
- ogranicza wykonanie krytycznych RPC do `service_role`.

RPC używają `SECURITY INVOKER`.

Oznacza to, że poprawne działanie zależy również od grantów roli wykonującej funkcję.

---

## 10. Ranking

Frontend nie czyta już `quiz_results` bezpośrednio.

`GET /api/quiz/leaderboard`:

- działa po stronie serwera,
- używa `createSupabaseAdmin()`,
- zwraca tylko whitelistę:
  - `id`,
  - `username`,
  - `score`,
  - `totalQuestions`.

Nie zwraca publicznie:

- `attempt_id`,
- `user_id`,
- `answers_pattern`,
- `played_at`,
- `time_taken`.

### Ważne

Przeniesienie rankingu na backend nie dowodzi, że zdalna baza nie posiada nadal publicznych grantów do `quiz_results`.

To musi zostać sprawdzone w osobnym audycie RLS/grantów.

---

## 11. Admin

Panel `/admin` nie ma jeszcze docelowej ochrony.

Aktualnie jest to znana luka przed publicznym soft-launchem.

Do wykonania:

- logowanie administratora,
- kontrola roli,
- ograniczenie zapisu pytań,
- usunięcie niepotrzebnego direct browser write,
- sprawdzenie grantów do `questions`.

Ochrona admina jest blockerem przed publicznym launch.

---

## 12. Origin i request validation

Krytyczne endpointy POST używają kontroli same-origin.

Zasady obejmują:

- jawnie oczekiwany Origin,
- dev fallback tylko dla localhost,
- produkcyjny HTTPS przez konfigurację origin.

Request body jest walidowane restrykcyjnie.

Answer i finish nie akceptują dodatkowych pól biznesowych poza kontraktem.

---

## 13. Timer i ranking

Timer pytania jest obecnie klientowy.

Nie jest bezpiecznym źródłem wartości używanej do rankingu.

Jeśli `time_taken` ma w przyszłości rozstrzygać remisy:

- nie należy ufać wartości przesłanej z przeglądarki,
- czas musi być liczony po stronie serwera/DB,
- albo mechanika czasu powinna zostać usunięta z rankingu MVP.

---

## 14. RLS / grants — stan wiedzy

Repozytorium nie zawiera jeszcze kompletnego, łatwego do audytu obrazu wszystkich aktywnych zdalnych polityk i grantów starej części schematu.

Dlatego nie zakładamy, że:

- publiczny SELECT jest niemożliwy,
- publiczny INSERT jest niemożliwy,
- zdalny stan RLS dokładnie odpowiada lokalnemu `schema.sql`.

Przed publicznym soft-launchem wymagany jest świadomy audyt:

- `questions`,
- `daily_challenges`,
- `quiz_results`,
- funkcje RPC,
- role `anon`,
- `authenticated`,
- `service_role`.

---

## 15. Znane ograniczenia bezpieczeństwa

Akceptowane lub odłożone:

- reset cookie/incognito pozwala uzyskać nową anonymous identity,
- brak Auth oznacza brak trwałego właściciela historii,
- brak rate limiting,
- timer klientowy,
- brak pełnej immutability opublikowanego challenge,
- pytania użyte w challenge nie mają jeszcze pełnej ochrony przed późniejszą mutacją,
- nie wykonano realnego testu dwóch współbieżnych sesji DB,
- nie wykonano forced failure/rollback między INSERT wyniku i `completed_at`,
- nie wykonano jeszcze pełnego audytu zdalnych grantów starego schematu.

Nie każdy z tych punktów blokuje pierwszy kontrolowany test, ale publiczny attack surface i `/admin` muszą być uporządkowane przed szerszym launch.

---

## 16. Priorytety przed soft-launchem

Zgodnie z `ROADMAP.md` najważniejsze security tasks to:

1. pełny audyt RLS/grantów,
2. ochrona `/admin`,
3. kontrola zapisu do `questions`,
4. potwierdzenie publicznego dostępu do `quiz_results`,
5. usunięcie zbędnych grantów.

Nie wdrażamy Auth tylko po to, aby ukryć problemy z modelem uprawnień.

---

## 17. Powiązane dokumenty

- `PROJECT_CONTEXT.md`
- `ROADMAP.md`
- `docs/testing.md`
- `docs/specs/daily-quiz.md`
- `docs/specs/question-validation.md`
- `docs/specs/analytics-specification.md`
