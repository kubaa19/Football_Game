# FootQuiz — Project Context

## 1. Cel produktu

FootQuiz to mobilna aplikacja webowa z krótkim, codziennym quizem piłkarskim.

Format MVP:
- jedno „Wyzwanie Dnia”,
- 5 pytań,
- ten sam zestaw dla wszystkich danego dnia,
- sesja około 1–2 minuty,
- wynik możliwy do udostępnienia,
- brak 1v1 na żywo i WebSockets.

Najważniejszym celem MVP jest sprawdzenie, czy gracze wracają.

**North Star:** retencja Day 1 i Day 7.  
Orientacyjny sygnał pozytywny dla D1: około 25–30% lub więcej, interpretowany razem z wielkością próby i pozostałymi metrykami.

Strategia promocji: `docs/MARKETING_STRATEGY.md`.

---

## 2. Zasady produktowe

### Activation before registration

Pierwsza gra nie wymaga konta.

```text
wejście
→ Daily Quiz bez konta
→ wynik
→ opcjonalnie „Zapisz swoją serię”
→ Google Auth
```

Auth ma utrwalać wartość już uzyskaną przez gracza, a nie blokować wejście do quizu.

### Soft-launch first

Nie budujemy całego docelowego MVP przed pokazaniem produktu użytkownikom.

Priorytet mają elementy potrzebne do:
1. niezawodnego codziennego działania gry,
2. bezpiecznego publicznego uruchomienia,
3. pomiaru zachowania graczy,
4. zdobycia pierwszych realnych użytkowników,
5. weryfikacji retencji i wiralowości.

Ligi, Typer Dnia, rozbudowane achievementy, sklep, serca i monetyzacja są odłożone do czasu uzyskania danych z realnego użycia.

Aktualny plan: `ROADMAP.md`.

---

## 3. Zakres i ograniczenia prawne MVP

Treści quizowe dotyczą faktów piłkarskich: historii, statystyk, rozgrywek, zasad i transferów.

Na start:
- nie używamy oficjalnych herbów klubowych,
- nie używamy płatnych zdjęć agencyjnych,
- unikamy materiałów wizualnych wymagających licencji.

To ogranicza ryzyka związane z prawami do treści i materiałów wizualnych, ale nie oznacza całkowitego wyeliminowania ryzyka prawnego.

---

## 4. Stack

- Next.js 16 / App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase / PostgreSQL
- Next.js Route Handlers
- Supabase RPC dla krytycznej logiki quizu

Publiczne zmienne Supabase są oddzielone od serwerowego `SUPABASE_SECRET_KEY`.

---

## 5. Aktualny core Daily Quiz

### Pobieranie pytań

`GET /api/quiz/daily`

Serwer:
- ustala dzień w UTC,
- pobiera `daily_challenges.question_ids`,
- zachowuje kolejność challenge,
- nie zwraca `correct_index`,
- nie zwraca `explanation` przed odpowiedzią,
- nie zwraca częściowego zestawu przy niespójności danych.

Stage 6: publisher PostgreSQL tworzy stabilny zestaw 5 pytań z puli `is_approved=true`. Przygotowuje dziś + 7 kolejnych dni UTC. Jeśli dzisiejszego challenge brakuje, `attempt/start` uruchamia serwerowy fallback; GET pozostaje read-only. Supabase Cron jest skonfigurowany i aktywny na development (`5 * * * *`); pierwszy rzeczywisty scheduled execution został potwierdzony — **PASS**.

### Anonymous identity

Gracz anonimowy posiada losowy sekret w HttpOnly cookie.

Po stronie bazy przechowywany jest SHA-256 hash tej wartości.

Reset cookie lub incognito może utworzyć nową anonimową tożsamość. Jest to zaakceptowane ograniczenie przed wdrożeniem Auth.

### Quiz attempts

Quiz wykorzystuje:
- `quiz_attempts`,
- `quiz_attempt_answers`,
- `quiz_results.attempt_id`.

`POST /api/quiz/attempt/start` tworzy lub wznawia próbę i zwraca autorytatywny stan serwera.

Frontend nie używa localStorage jako źródła prawdy o postępie.

### Odpowiedzi

`POST /api/quiz/answer`

- przyjmuje `attemptId`, `questionId`, `selectedIndex`,
- zapisuje pierwszy zaakceptowany wybór przez RPC `record_quiz_attempt_answer`,
- odpowiedzi są immutable,
- identyczny retry jest idempotentny,
- poprawność jest liczona po stronie serwera,
- dopiero po odpowiedzi serwer może zwrócić `correctIndex` i `explanation`.

### Finalizacja

`POST /api/quiz/attempt/finish`

- przyjmuje tylko `attemptId` i `username`,
- klient nie przesyła score ani wzoru odpowiedzi,
- RPC `finish_quiz_attempt` wylicza wynik z zapisanych odpowiedzi,
- wynik jest zapisywany atomowo,
- retry zakończonej próby zwraca istniejący wynik.

Legacy ścieżki `/api/quiz/result` i `/quiz/result` zostały usunięte.

---

## 6. Ranking

Frontend nie odczytuje już `quiz_results` bezpośrednio z publicznego klienta Supabase.

`GET /api/quiz/leaderboard`:
- działa po stronie serwera,
- używa `createSupabaseAdmin()`,
- ustala dzień w UTC,
- obecnie zwraca TOP 10,
- publicznie wystawia tylko `id`, `username`, `score`, `totalQuestions`,
- rozróżnia pusty ranking od błędu.

Docelowo ranking MVP ma przejść do TOP 50.

Nie podjęto jeszcze finalnej decyzji, czy czas będzie tie-breakerem. Jeżeli `time_taken` ma wpływać na ranking, nie może być zaufaną wartością podawaną przez klienta.

---

## 7. Auth i streak

Supabase Auth nie jest jeszcze wdrożony.

Na pierwszym soft-launchu konto nie musi być wymagane.

Docelowo po zakończeniu quizu aplikacja może proponować:

**„Zapisz swoją serię” → Google Auth**

Wdrożenie Auth powinno zachować anonimowy postęp użytkownika po przejściu anonymous → account.

Prawdziwy streak nie jest jeszcze wdrożony; obecne wartości na stronie głównej są placeholderami.

---

## 8. Content i jakość pytań

Aktualny pipeline:

```text
generator
→ walidacja techniczna
→ ręczna kontrola merytoryczna
→ import do Supabase
```

Generator: `src/scripts/question-generator.txt`  
Walidator: `src/scripts/prompts/validate-questions.js`  
Specyfikacja: `docs/specs/question-validation.md`

Walidacja techniczna nie potwierdza poprawności faktograficznej. Nowe publikacje wymagają ręcznego approval operatora (`questions.is_approved`, domyślnie `false`); sam import nie dopuszcza pytania do publikacji.

Na MVP każde pytanie wymaga ręcznej kontroli:
- faktu,
- wszystkich czterech opcji,
- `correct_index`,
- `explanation`,
- jednoznaczności pytania.

Automatyczny factual validation jest odłożony do czasu, gdy ręczna weryfikacja stanie się realnym wąskim gardłem.

Przed soft-launchem ważniejsza jest mniejsza baza dobrze sprawdzonych pytań niż szybkie osiągnięcie arbitralnej liczby rekordów.

---

## 9. Analytics

Analityka produktowa nie jest jeszcze wdrożona i jest jednym z najbliższych etapów przed soft-launchem.

Minimalnie chcemy mierzyć:
- `quiz_started`,
- odpowiedzi / miejsce porzucenia,
- `quiz_completed`,
- zapis wyniku,
- `result_shared`,
- źródło ruchu / UTM,
- Daily completion rate,
- D1,
- D7,
- Share Rate,
- share → visit → completed quiz.

Szczegóły: `docs/specs/analytics-specification.md`

Specyfikacja może wymagać uproszczenia przed implementacją zgodnie z zasadą minimalnego zakresu soft-launchu.

---

## 10. Security — aktualne granice

Już wdrożone:
- odpowiedzi nie są oceniane przez frontend,
- `correct_index` nie jest dostarczany przed odpowiedzią,
- immutable persisted answers,
- server-authoritative attempt,
- idempotencja answer i finish,
- finalizacja wyniku po stronie PostgreSQL,
- leaderboard read po stronie serwera.

Przed publicznym soft-launchem nadal wymagane są:
- audyt RLS i grantów,
- sprawdzenie bezpośredniego dostępu do `quiz_results`,
- ochrona `/admin`,
- kontrola dostępu do zapisu pytań.

Szczegóły: `docs/specs/security-and-data-access.md`

---

## 11. Znane ograniczenia

- timer 15 s działa po stronie klienta,
- timer może zresetować się po refreshu nierozwiązanego pytania,
- `time_taken` nie jest obecnie zapisywany,
- dzień quizowy jest liczony w UTC,
- Auth nie istnieje,
- streak nie istnieje,
- admin nie ma jeszcze docelowej ochrony,
- brak kompletnego audytu RLS/grantów,
- brak pełnej automatycznej factual validation,
- rzeczywista konkurencja dwóch sesji DB i forced rollback pozostają testami odłożonymi.

Szczegóły wykonanych testów: `docs/testing.md`.

---

## 12. Dokumentacja

- `ROADMAP.md` — aktualny postęp i kolejność wdrożeń.
- `docs/testing.md` — wykonane testy i ręczne weryfikacje.
- `docs/MARKETING_STRATEGY.md` — pozyskanie pierwszych użytkowników i organiczny growth.
- `docs/specs/daily-quiz.md` — Daily Quiz.
- `docs/specs/security-and-data-access.md` — bezpieczeństwo.
- `docs/specs/question-validation.md` — jakość pytań.
- `docs/specs/analytics-specification.md` — analityka i atrybucja.
- `docs/specs/achievements-and-progression.md` — późniejsza grywalizacja.
- `docs/specs/daily-match-predictor.md` — Typer Dnia / post-validation.

`PROJECT_CONTEXT.md` ma pozostać krótkim opisem aktualnego produktu i najważniejszych decyzji. Historia wdrożeń należy do `ROADMAP.md` i `docs/testing.md`.
