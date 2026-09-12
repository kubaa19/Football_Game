# Specyfikacja Techniczna: Analytics MVP (FootQuiz)

## 1. Cel i status

**Stage 7: DONE dla MVP.** Umami Cloud EU, plan Free; realna integracja została potwierdzona przez operatora. Analytics mierzy obserwowaną aktywność użytkowników ze zgodą, nie pełną populację graczy. Core D1/D7 pozostaje metryką produktową, ale jego dokładny raport jest świadomie odłożony.

## 2. Provider i architektura

Umami Cloud EU działa przez `AnalyticsProvider.tsx`, `analytics.ts`, `quizAnalytics.ts`, `analyticsIdentity.ts` i `analyticsState.ts`. Tracker ładuje się dopiero po zgodzie. Automatyczny tracking/pageviews jest wyłączony; wysyłamy pięć custom events. `identify()` poprzedza wysłanie eventów.

Publiczna konfiguracja: `NEXT_PUBLIC_UMAMI_SCRIPT_URL` i `NEXT_PUBLIC_UMAMI_WEBSITE_ID`. Sekrety nie trafiają do browser bundle. Analytics jest best-effort, nie blokuje gameplayu i nie zmienia wyniku.

## 3. Identity i consent — finalna decyzja A

Osobny losowy `analytics_id` jest zapisywany w localStorage dopiero po consent i przekazywany jako Distinct ID Umami. Nie jest powiązany z gameplay identity i nie daje dostępu do attempts.

Gameplay startuje natychmiast, bez consent gate. Eventy przy `unknown` lub `rejected` są pomijane i nie są odtwarzane po późniejszym Accept. Pierwsza próba może nie mieć `quiz_started`, a późniejsze `question_answered` i `quiz_completed` mogą istnieć bez start eventu. To oczekiwane zachowanie privacy, nie bug transportu.

Wycofanie zgody usuwa analytics identity, attribution i dedup oraz blokuje dalsze eventy. Nie zmienia gameplay cookie ani preferencji username. Zgoda udzielona przed eventem pozwala zachować go w ograniczonej kolejce podczas inicjalizacji providera; nie kolejkujemy historii sprzed zgody.

## 4. Event taxonomy

| Event | Trigger | Properties |
|---|---|---|
| `quiz_viewed` | Wejście na /quiz, przed startem | opcjonalne UTM; bez wyliczania daty w browserze |
| `quiz_started` | Udany start i validateAttemptResume; tylko in_progress z nextQuestionId | challenge_date, resumed, opcjonalne UTM |
| `question_answered` | Potwierdzona odpowiedź backendu, także pierwszy potwierdzony replay | challenge_date, question_number 1..5, correct, timed_out |
| `quiz_completed` | Autorytatywny sukces finish, przed resync | challenge_date, score, total_questions=5, opcjonalne UTM |
| `leaderboard_viewed` | Wyrenderowany success rankingu, również pustego | brak |

Nie ma `result_saved`: zapis i finalizacja są jednym atomowym zdarzeniem biznesowym. Completed resume nie odtwarza completion, piąta odpowiedź go nie zastępuje, a błąd resync po successful finish go nie cofa. Daty pochodzą z backendu, dzień produktu to UTC.

## 5. Deduplikacja i niezawodność

Lokalny rejestr analytics ma limit 512 wpisów. Klucze: wejście dla viewed, attempt dla started/completed, attempt + numer pytania dla answered. Identyfikatory w kluczach pozostają lokalne. Znacznik poprzedza próbę wysłania; preferujemy undercount zamiast duplikatów przy niepewnym wyniku. Kolejka pamięciowa ma limit 32 eventów.

Retry/replayed może być pierwszym potwierdzeniem i wtedy emituje event. StrictMode, rerender i resume są chronione lokalnie. Nie gwarantujemy exactly-once między kartami, po usunięciu storage ani po wyparciu starych wpisów. Brak zgody, błędy storage, adblock i awaria providera mogą powodować niedoliczenie.

## 6. Funnel MVP

Docelowa konfiguracja w Umami, timezone UTC:

```text
quiz_viewed
→ quiz_started
→ question_answered where question_number = 1
→ question_answered where question_number = 2
→ question_answered where question_number = 3
→ question_answered where question_number = 4
→ question_answered where question_number = 5
→ quiz_completed
```

Funnel reprezentuje obserwowaną ścieżkę consenting subset. Nie jest miarą całej populacji ani wszystkich ukończeń. Nie należy interpretować surowego ilorazu wszystkich completion/start jako konwersji pełnego funnelu: completion może nie mieć startu. Konfiguracja powyżej jest celem raportu, nie deklaracją wykonania testu dashboardowego funnelu.

## 7. Core retention — definicja i backlog

- Day 0: pierwszy **zaobserwowany** quiz_completed dla analytics identity; niekoniecznie pierwsze ukończenie quizu w produkcie.
- Core D1: completion tej samej identity dokładnie następnego dnia UTC.
- Core D7: completion dokładnie siódmego dnia UTC.
- Wielokrotne completion jednego dnia liczą identity raz; niedojrzałe kohorty nie wchodzą do denominatora.

Native Umami Retention nie realizuje dokładnej definicji FootQuiz. Obecny Umami Cloud Free nie daje API access. Operatorski raport API nie jest zaimplementowany; wróci po przejściu na Pro albo wyborze innego minimalnego źródła danych. Przyszły raport wymaga paginacji, powiązania event → sessionId → distinctId, kompletnej dostępnej historii oraz zagregowanego outputu bez surowych ID.

Nie dodajemy Supabase analytics ani hurtowni. To jawna limitation/backlog Free planu, nie blocker soft launchu. Reset storage/identity i brak zgody ograniczają obserwowaną retencję.

## 8. UTM

Current-touch, bez first-touch. Po zgodzie sessionStorage zachowuje `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` przy przejściu / → /quiz. Nowe UTM zastępuje poprzednie. Wartości: 1..80 znaków ASCII liter/cyfr, underscore lub myślnik. Nie zapisujemy całego query ani referrera.

UTM trafia wyłącznie do quiz_viewed, quiz_started i quiz_completed. Wycofanie zgody usuwa attribution.

## 9. Minimalizacja danych

Nie wysyłamy username, attemptId, questionId, selectedIndex, correctIndex, treści pytania/options/explanation, gameplay cookie, anonymous_token_hash ani sekretów Supabase. Publiczny payload jest whitelistowany; analytics identity pozostaje osobnym identyfikatorem.

Bez Auth linking, session replay, heatmap, A/B testów, BI, share events i marketing automation. Informacje privacy dla publicznego wdrożenia powinny odzwierciedlać faktyczny consent i persistence.

## 10. Weryfikacja i Definition of Done

Real smoke test operatora: script loaded po zgodzie, identify, quiz_viewed, question_answered, quiz_completed, leaderboard_viewed w dashboardzie i payload audit — PASS. Brak gameplay identifiers w sprawdzonych payloadach — PASS. Transport quiz_started potwierdzono po resume; fresh start przed zgodą jest poprawnie pomijany.

Testy automatyczne obejmują whitelisty, consent, kolejkę przed readiness, realny lifecycle na mockach, dedup i błędy providera. Szczegóły: [testing.md](../testing.md).

MVP DONE oznacza działającą realną integrację i zaakceptowane ograniczenia consent/Free. Nie oznacza gotowego raportu Core D1/D7 ani potwierdzonej konfiguracji pełnego funnelu. Te elementy pozostają w backlogu raportowania.
