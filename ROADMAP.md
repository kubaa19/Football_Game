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
**Status: NEXT**

### Cel
FootQuiz ma działać następnego dnia bez ręcznego INSERT w Supabase.

### Minimalny zakres
- automatyczne utworzenie/publikacja `daily_challenges`,
- dokładnie 5 pytań,
- unikalne `question_ids`,
- brak zmiany zestawu już opublikowanego dnia,
- idempotentny retry,
- kontrolowany fallback ręczny,
- czytelny komunikat UI, gdy quiz nie jest dostępny,
- możliwość przygotowania challenge'ów z wyprzedzeniem,
- ręczny fallback, gdy automatyczna publikacja zawiedzie,
- brak sytuacji, w której awaria schedulera pozostawia dany dzień bez quizu.

### Do decyzji
Najprostszy scheduler produkcyjny:
- Vercel Cron,
- Supabase scheduled job,
- inny minimalny mechanizm.

Nie budujemy rozbudowanego CMS tylko po to, aby rozwiązać ten etap.

### Definition of Done
Nowy dzień nie wymaga ręcznej interwencji właściciela, aby użytkownicy mogli rozpocząć Daily.

---

## Stage 7 — Analytics MVP
**Status: PLANNED — HIGH PRIORITY**

### Dlaczego teraz
North Star to D1/D7. Start bez analytics oznacza utratę danych z pierwszych użytkowników.

### Minimalny zakres
- `quiz_started`,
- `question_answered` lub równoważny pomiar miejsca porzucenia,
- `quiz_completed`,
- `result_saved`,
- `result_shared`,
- source / UTM.

KPI:
- completion rate,
- D1,
- D7,
- share rate,
- share → visit,
- share → completed quiz,
- retencja wg źródła.

`docs/specs/analytics-specification.md` jest punktem wyjścia, nie obowiązkowym zakresem 1:1.

### Definition of Done
Po starcie potrafimy policzyć podstawowy funnel i retencję.

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

## Stage 12 — Production polish + soft-launch
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

Anonymous → authenticated continuity: utworzenie konta nie może rozpoczynać historii gracza od zera. Przy logowaniu należy bezpiecznie powiązać dotychczasową anonimową tożsamość, wyniki i streak z auth.users.id. Mechanizm migracji zostanie zaprojektowany przy wdrażaniu Auth i nie blokuje pierwszego soft-launchu bez kont.

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
- published challenge immutability,
- ochrona pytań użytych w opublikowanym challenge,
- lepsza synchronizacja `supabase/schema.sql` z migracjami,
- factual validation Stage 2, jeśli ręczna kontrola stanie się bottleneckiem,
- rate limiting, jeśli pojawi się realna potrzeba.

Nie każdy punkt jest blockerem soft-launchu.

---

# 7. Milestone: gotowość do soft-launchu

FootQuiz jest gotowy do pierwszego kontrolowanego soft-launchu, gdy:

- [ ] Daily tworzy się automatycznie każdego dnia,
- [ ] podstawowe analytics działają,
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
