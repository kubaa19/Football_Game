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

Priorytet mają elementy potrzebne do niezawodnego działania Daily, bezpiecznego uruchomienia, pomiaru zachowania graczy i weryfikacji retencji.

Aktualny plan: `ROADMAP.md`.

---

## 3. Stack

- Next.js 16 / App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase / PostgreSQL
- Next.js Route Handlers
- Supabase RPC dla krytycznej logiki quizu

Publiczne zmienne Supabase są oddzielone od serwerowego `SUPABASE_SECRET_KEY`.

---

## 4. Daily Quiz — aktualny stan

`GET /api/quiz/daily`:
- ustala dzień w UTC,
- pobiera kolejność z `daily_challenges.question_ids`,
- wymaga dokładnie 5 pytań,
- nie zwraca `correct_index`,
- nie zwraca `explanation` przed odpowiedzią,
- pozostaje read-only.

### Automatic Daily Challenge — Stage 6 DONE

Publisher PostgreSQL:
- publikuje dokładnie 5 unikalnych pytań,
- używa tylko pytań `is_approved=true` spełniających minimalne warunki techniczne,
- deterministycznie wybiera kolejność,
- nie zmienia istniejącego poprawnego challenge,
- obsługuje idempotentny retry,
- potrafi przygotować atomowo okno dziś + 7 kolejnych dni UTC,
- przy zbyt małej puli nie tworzy częściowego challenge.

`POST /api/quiz/attempt/start`:
- najpierw próbuje odczytać dzisiejszy challenge,
- publisher uruchamia tylko wtedy, gdy challenge nie istnieje,
- po publikacji ponownie odczytuje challenge,
- kontroluje zmianę dnia UTC,
- nie przyjmuje daty publikacji od browsera.

Supabase Cron:
- `pg_cron` 1.6.4,
- job `footquiz-daily-challenges`,
- harmonogram `5 * * * *`,
- przygotowuje okno 8 dni,
- pierwszy realny scheduled execution: **PASS**.

Istnieje również kontrolowany ręczny fallback operatora przez ten sam publisher.

---

## 5. Anonymous identity i attempts

Gracz anonimowy posiada losowy sekret w HttpOnly cookie. Po stronie bazy przechowywany jest SHA-256 hash tej wartości.

Quiz wykorzystuje:
- `quiz_attempts`,
- `quiz_attempt_answers`,
- `quiz_results.attempt_id`.

`POST /api/quiz/attempt/start` tworzy lub wznawia próbę i zwraca autorytatywny stan serwera.

`POST /api/quiz/answer`:
- zapisuje pierwszy zaakceptowany wybór,
- odpowiedzi są immutable,
- identyczny retry jest idempotentny,
- poprawność jest liczona po stronie serwera,
- feedback z `correctIndex` i `explanation` pojawia się dopiero po odpowiedzi.

`POST /api/quiz/attempt/finish`:
- klient nie przesyła score ani wzoru odpowiedzi,
- wynik jest wyliczany z persisted answers,
- finalizacja jest atomowa,
- retry zwraca istniejący wynik.

Legacy `/api/quiz/result` i `/quiz/result` zostały usunięte.

---

## 6. Ranking

`GET /api/quiz/leaderboard` działa po stronie serwera.

Obecnie:
- TOP 10,
- whitelist publicznych pól,
- brak bezpośredniego browserowego SELECT na `quiz_results`.

Docelowo Stage 8 obejmie TOP 50 i decyzję dotyczącą tie-breakera czasu.

---

## 7. Content

Pipeline:

```text
generator
→ walidacja techniczna
→ ręczna kontrola merytoryczna
→ import
→ approval
→ publikacja
```

`questions.is_approved` domyślnie wynosi `false`. Sam import nie kwalifikuje pytania do publikacji.

Walidacja techniczna nie zastępuje ręcznej kontroli faktograficznej.

---

## 8. Analytics — Stage 7 NEXT

Podjęta decyzja:
- **Umami Cloud EU**,
- cienka abstrakcja `track(...)`,
- oddzielna `analytics_id`, niezależna od gameplay cookie/hash,
- minimalizacja danych,
- bez session replay, heatmap i A/B testów na MVP.

Minimalne eventy:
- `quiz_viewed`,
- `quiz_started`,
- `question_answered`,
- `quiz_completed`,
- `result_saved`,
- `leaderboard_viewed`.

North Star:
- Day 0: pierwsze `quiz_completed`,
- Core D1: `quiz_completed` następnego dnia,
- Core D7: `quiz_completed` siódmego dnia.

Nie wysyłamy do analytics gameplay cookie/hash, username jako identity, sekretów Supabase ani treści pytań/odpowiedzi.

Spec: `docs/specs/analytics-specification.md`.

---

## 9. Auth i streak

Auth nie jest jeszcze wdrożony i nie blokuje pierwszego soft-launchu.

Docelowy flow:

```text
wejście
→ Daily bez konta
→ wynik
→ „Zapisz swoją serię”
→ Google Auth
```

Przy wdrożeniu Auth należy zachować ciągłość anonymous → authenticated, tak aby konto nie rozpoczynało historii użytkownika od zera.

---

## 10. Security — pozostałe priorytety

Przed szerokim publicznym ruchem nadal wymagane są:
- audyt RLS i grantów,
- kontrola bezpośredniego dostępu do starych tabel,
- ochrona `/admin`,
- kontrola uprawnień zapisu/edycji pytań.

Stage 6 stabilizuje publikację challenge, ale pełne versioning/freeze treści pytań użytych w opublikowanym challenge pozostaje odłożone.

---

## 11. Znane ograniczenia

- timer 15 s działa po stronie klienta,
- timer może zresetować się po refreshu nierozwiązanego pytania,
- `time_taken` nie jest obecnie wiarygodnym server-authoritative tie-breakerem,
- dzień quizowy jest liczony w UTC,
- Auth i prawdziwy streak nie istnieją,
- `/admin` nie ma jeszcze docelowej ochrony,
- brak kompletnego audytu RLS/grantów,
- brak pełnej automatycznej factual validation,
- realny test concurrency dwóch sesji DB i forced rollback pozostają DEFERRED,
- analytics ma gotową decyzję/specyfikację, ale nie jest jeszcze zaimplementowane.

---

## 12. Dokumentacja

- `ROADMAP.md` — aktualny postęp i kolejność wdrożeń.
- `docs/testing.md` — wykonane testy i ręczne weryfikacje.
- `docs/MARKETING_STRATEGY.md` — organiczny growth.
- `docs/specs/daily-quiz.md` — Daily Quiz.
- `docs/specs/security-and-data-access.md` — bezpieczeństwo.
- `docs/specs/question-validation.md` — jakość pytań.
- `docs/specs/analytics-specification.md` — Analytics MVP.
- `docs/specs/achievements-and-progression.md` — późniejsza grywalizacja.
- `docs/specs/daily-match-predictor.md` — Typer Dnia / post-validation.

`PROJECT_CONTEXT.md` opisuje aktualny produkt i obowiązujące decyzje. Historia wdrożeń należy do `ROADMAP.md` i `docs/testing.md`.
