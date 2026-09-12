# FootQuiz — Roadmap

Status: aktywna roadmapa projektu  
Priorytet: **najkrótsza bezpieczna droga do soft-launchu i pierwszych prawdziwych danych**

---

## 1. Zasada roadmapy

Nie budujemy pełnej wizji FootQuiz przed pierwszym uruchomieniem.

Każdy etap powinien odpowiedzieć na jedno z pytań:
1. Czy bez tego aplikacja może przestać działać?
2. Czy bez tego publiczny start byłby niebezpieczny?
3. Czy bez tego nie będziemy w stanie zmierzyć zachowania użytkowników?
4. Czy bez tego pierwszy użytkownik nie dostanie kompletnego doświadczenia?
5. Czy możemy odłożyć tę funkcję do czasu uzyskania danych?

Jeżeli odpowiedź na 5. brzmi „tak”, funkcja nie powinna blokować soft-launchu.

---

# 2. Completed foundation

## Stage 1–4 — Secure Daily Quiz attempts
**Status: DONE**

Zbudowano:
- anonimową identity przez HttpOnly cookie,
- `quiz_attempts`,
- `quiz_attempt_answers`,
- start/resume,
- immutable first answer,
- server-side correctness,
- persisted answer przed feedbackiem,
- idempotentny retry,
- atomową finalizację przez `finish_quiz_attempt`,
- server-authoritative completed state.

Szczegóły: `docs/testing.md`.

## Stage 5 — Legacy result flow removal
**Status: DONE**

Usunięto:
- `/api/quiz/result`,
- `/quiz/result`,
- stary `saveQuizResult`,
- legacy frontend save flow,
- stare typy alternatywnego zapisu.

Jedyną wspieraną ścieżką zapisu wyniku w aplikacji jest attempts flow.

## Stage 5.1 — Server-side leaderboard
**Status: DONE**

Ranking:
- nie wykonuje już browserowego SELECT na `quiz_results`,
- korzysta z `GET /api/quiz/leaderboard`,
- zwraca whitelistę publicznych pól,
- rozróżnia empty/error,
- ma retry w UI.

---

# 3. Soft-launch path

## Stage 6 — Automatic Daily Challenge
**Status: DONE**

### Cel
FootQuiz ma działać następnego dnia bez ręcznego INSERT w Supabase.

### Ukończony zakres
- `questions.is_approved BOOLEAN NOT NULL DEFAULT false`,
- tylko approved i technicznie poprawne pytania kwalifikują się do nowych publikacji,
- dokładnie 5 unikalnych pytań w challenge,
- deterministyczny wybór kolejności,
- idempotentny `ensure_daily_challenge(date)`,
- atomowe `ensure_daily_challenge_window(start_date, 8)`,
- prepublishing: dziś + 7 kolejnych dni UTC,
- istniejący poprawny challenge pozostaje bez zmian,
- brak częściowej publikacji przy zbyt małej puli,
- kontrolowany ręczny fallback operatora przez ten sam publisher,
- server-side fallback w `POST /api/quiz/attempt/start` tylko wtedy, gdy dzisiejszego challenge brakuje,
- po fallbacku ponowny SELECT i kontrola zmiany dnia UTC,
- `GET /api/quiz/daily` pozostaje read-only i wymaga dokładnie 5 pytań,
- bezpieczne mapowanie błędów bez ujawniania surowych błędów PostgreSQL,
- ochrona opublikowanego `daily_challenges` przed UPDATE/DELETE przez normalny flow aplikacji,
- emergency maintenance dla `postgres`,
- Supabase `pg_cron` 1.6.4,
- aktywny job `footquiz-daily-challenges`,
- harmonogram `5 * * * *`,
- pierwszy realny scheduled Cron execution: **PASS**.

### Potwierdzone testy
- migracja Stage 6 na development: PASS,
- `supabase/tests/daily_challenges.sql`: PASS,
- `supabase/tests/quiz_attempts.sql`: PASS,
- pięć seed questions zatwierdzonych: PASS,
- real publisher dla 2026-09-12: `created=true`: PASS,
- identyczny retry: `created=false`, ten sam challenge: PASS,
- realne okno 8 dni: PASS,
- fallback/regression mock tests: PASS,
- leaderboard regression: PASS,
- TypeScript typecheck: PASS,
- build: PASS,
- `git diff --check`: PASS,
- manualny Daily payload: dokładnie 5 pytań, bez `correct_index` i `explanation`: PASS,
- scheduled Cron execution: PASS.

### Świadomie odłożone
- rzeczywisty test dwóch równoległych sesji DB — DEFERRED,
- forced failure / rollback test — DEFERRED,
- pełne versioning/freeze treści opublikowanych pytań — DEFERRED.

### Definition of Done
Nowy dzień nie wymaga ręcznej interwencji właściciela, aby użytkownicy mogli rozpocząć Daily, a awaria schedulera nie powinna sama w sobie pozostawić dnia bez quizu dzięki 7-dniowemu prepublishingowi, fallbackowi startu i ręcznemu fallbackowi operatora.

Szczegóły: `docs/testing.md`.

---

## Stage 7 — Analytics MVP
**Status: DONE (MVP)**

### Ukończony zakres
- Umami Cloud EU / Free, real integration verified przez operatora,
- osobna random analytics identity w localStorage po consent, Distinct ID bez gameplay identity,
- pięć eventów: quiz_viewed, quiz_started, question_answered, quiz_completed, leaderboard_viewed,
- current-touch UTM w sessionStorage po zgodzie,
- whitelist payloadów, lokalny dedup i ograniczona kolejka,
- real smoke test i payload audit PASS.

### Finalna decyzja consent
Wariant A: gameplay bez gate. Eventy unknown/rejected są pomijane bez odtwarzania po Accept. Start może nie istnieć dla pierwszej próby; completion może istnieć bez startu. Funnel dotyczy obserwowanego consenting subset.

### Retention i backlog raportowania
Core D1/D7 pozostaje celem produktowym: Day 0 = pierwszy zaobserwowany quiz_completed, powroty dokładnie +1/+7 dni UTC. Native Umami Retention nie realizuje dokładnej definicji. Free nie daje API access; operatorski raport odłożony do Pro lub innego minimalnego źródła danych. Bez nowej hurtowni i Supabase analytics. Ograniczenie nie blokuje soft launchu.

Docelowy funnel: viewed → started → answered #1..#5 → completed. Konfiguracja/weryfikacja pełnego raportu pozostaje zadaniem operatorskim; nie deklarujemy jej jako testu PASS.

### Definition of Done MVP
Realne eventy i bezpieczne payloady działają, gameplay pozostaje niezależny od analytics, ograniczenia consent i Free są zaakceptowane i udokumentowane. Nie wymagamy raportu API do MVP.

Spec: [analytics-specification.md](docs/specs/analytics-specification.md). Testy: [testing.md](docs/testing.md).
Share events nadal należą do Stage 11; bez Auth, heatmap, session replay i A/B tests.

---

## Stage 8 — Ranking MVP
**Status: PLANNED**

### Zakres
- TOP 10 → TOP 50,
- stabilne sortowanie,
- obsługa remisów,
- finalna decyzja dotycząca czasu.

### Decyzja produktowa
Czy `time_taken` naprawdę ma być tie-breakerem MVP?

Preferencja:
- jeśli nie wnosi istotnej wartości — odkładamy,
- jeśli wpływa na ranking — pomiar musi być server-authoritative.

### Definition of Done
Ranking ma jasne zasady i nie opiera pozycji na łatwej do zmanipulowania wartości klienta.

---

## Stage 9 — Security hardening + Admin protection
**Status: PLANNED — BLOCKER BEFORE PUBLIC LAUNCH**

### Zakres
- audyt RLS i grantów,
- dostęp `anon`, `authenticated`, `service_role`,
- szczególna kontrola `quiz_results`,
- publiczny dostęp do `questions` i `daily_challenges`,
- ochrona `/admin`,
- autoryzacja zapisu/edycji pytań,
- usunięcie zbędnych uprawnień.

### Definition of Done
Anonimowy użytkownik nie może wykonywać operacji administracyjnych ani korzystać z danych poza świadomie wystawionym API.

---

## Stage 10 — Content readiness
**Status: PLANNED — BLOCKER BEFORE SOFT-LAUNCH**

### Cel
Zaufanie do pytań jest ważniejsze niż liczba pytań.

### Zakres
- pula pytań na pierwsze dni,
- ręczna weryfikacja każdego pytania,
- validator techniczny,
- kontrola duplikatów i jednoznaczności,
- różnorodność kategorii i trudności.

### Zasada
Nie czekamy na idealne 300 pytań.

Lepsze jest 50–100 bardzo dobrych pytań niż 300 niepewnych.

### Definition of Done
Można uruchomić test przez zaplanowany okres bez codziennego ręcznego tworzenia contentu.

---

## Stage 11 — Share / virality MVP
**Status: PLANNED — HIGH PRIORITY BEFORE WIDER LAUNCH**

### Minimalny zakres
- wynik `x/5`,
- kafelki Wordle-like,
- Web Share,
- clipboard fallback,
- link do FootQuiz,
- UTM/source attribution,
- brak spoilerów.

### Później
- challenge number,
- personalizowane challenge linki,
- referral attribution,
- achievement „Skaut”.

### Definition of Done
Gracz może jednym działaniem wysłać wynik znajomemu, a aplikacja potrafi zmierzyć wejście z share.

---

## Stage 12 — Production polish + soft launch
**Status: PLANNED**

### Zakres
- loading states,
- komunikaty błędów,
- mobile QA,
- Chrome / Safari,
- refresh/resume,
- monitoring błędów,
- env produkcyjne,
- smoke test flow,
- usunięcie mylących placeholderów,
- prosty kanał feedbacku i zgłaszania błędów pytań.

### Soft-launch
Pierwszy test:
- własna sieć kontaktów,
- WhatsApp / Messenger / Discord,
- wybrane społeczności piłkarskie,
- mała liczba użytkowników,
- celem są dane i feedback, nie maksymalny zasięg.

---

# 4. Auth i streak

## Streak MVP
**Status: POST-FIRST-TEST / OPTIONAL BEFORE WIDER LAUNCH**

Prawdziwy streak jest ważny dla retencji, ale nie musi blokować pierwszego małego testu.

Może początkowo działać na anonimowej identity.

Ryzyko: reset cookie/incognito oznacza utratę anonimowej serii.

## Auth
**Status: POST-FIRST-TEST / HIGH PRIORITY ONCE STREAK MATTERS**

Docelowy UX:

```text
wejście
→ Daily bez konta
→ wynik
→ „Zapisz swoją serię”
→ Google Auth
```

Wymagania:
- brak login wall przed quizem,
- migracja anonymous → account,
- zachowanie wyniku i streaka,
- Google jako główna prosta opcja.

Anonymous → authenticated continuity: utworzenie konta nie może rozpoczynać historii gracza od zera. Przy logowaniu należy bezpiecznie powiązać dotychczasową anonimową tożsamość, wyniki i streak z `auth.users.id`. Mechanizm migracji zostanie zaprojektowany przy wdrażaniu Auth i nie blokuje pierwszego soft-launchu bez kont.

---

# 5. Post-validation roadmap

Nie blokuje soft-launchu:

### Grywalizacja
- achievementy,
- rozbudowany streak,
- Streak Freeze,
- XP,
- ligi,
- serca / energia,
- Endless / Wieża Mistrzów.

Spec: `docs/specs/achievements-and-progression.md`.

### Typer Dnia
Potencjalna pętla D1:

```text
typ dziś
→ wynik meczu
→ powrót jutro
→ odbiór nagrody
```

Wdrażamy dopiero po walidacji podstawowego Daily Quiz.

Spec: `docs/specs/daily-match-predictor.md`.

### Monetyzacja
Nie jest priorytetem przed potwierdzeniem retencji.

Model ma wynikać z zachowania realnych użytkowników.

---

# 6. Backlog techniczny

Do wykonania w odpowiednim momencie:
- realny test dwóch współbieżnych sesji DB,
- forced failure / rollback,
- większa macierz Origin/cookie/network,
- pełna ochrona treści pozostaje niżej; immutability challenge dla ról aplikacyjnych wdrożono w Stage 6,
- ochrona pytań użytych w opublikowanym challenge,
- lepsza synchronizacja `supabase/schema.sql` z migracjami,
- factual validation Stage 2, jeśli ręczna kontrola stanie się bottleneckiem,
- rate limiting, jeśli pojawi się realna potrzeba.

Nie każdy punkt jest blockerem soft-launchu.

---

# 7. Milestone: gotowość do soft-launchu

FootQuiz jest gotowy do pierwszego kontrolowanego soft-launchu, gdy:

- [x] Daily tworzy się automatycznie każdego dnia — publisher, fallback i Cron potwierdzone na development,
- [x] podstawowe analytics działają,
- [ ] publiczny attack surface i `/admin` są zabezpieczone,
- [ ] mamy zweryfikowaną pulę pytań na okres testu,
- [ ] pełny flow start → answers → finish → resume działa produkcyjnie,
- [ ] wynik można sensownie udostępnić,
- [ ] źródło wejścia z share można zmierzyć,
- [ ] UI nie ma blockerów mobilnych ani mylących placeholderów,
- [ ] istnieje prosty sposób zebrania feedbacku.

**Auth nie jest wymagany do pierwszego kontrolowanego testu.**  
**Pełny streak nie jest wymagany do pierwszego kontrolowanego testu.**

---

# 8. Jak aktualizować roadmapę

Po każdym zakończonym Stage:
1. zmień jego status,
2. krótko zapisz rezultat,
3. nie kopiuj logów testów,
4. szczegóły dopisz do `docs/testing.md`,
5. jeśli zmienia się architektura lub zasada produktowa, zaktualizuj `PROJECT_CONTEXT.md`.

`ROADMAP.md`: **gdzie jesteśmy i co robimy następne?**  
`PROJECT_CONTEXT.md`: **czym jest FootQuiz i jakie decyzje obowiązują?**  
`docs/testing.md`: **co naprawdę przetestowaliśmy?**
