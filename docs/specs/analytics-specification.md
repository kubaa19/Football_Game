# Specyfikacja Techniczna: Analytics MVP (FootQuiz)

## 1. Cel biznesowy

Analytics ma być gotowe przed soft-launchem i odpowiedzieć przede wszystkim na pytania:

1. Ilu użytkowników wchodzi do Daily Quiz?
2. Ilu faktycznie zaczyna quiz?
3. Gdzie odpadają?
4. Ilu kończy quiz?
5. Ilu zapisuje wynik?
6. Ilu wraca następnego dnia?
7. Jaka jest retencja D1 i D7?

**North Star:** D1 i D7 retention oparte na faktycznej grze, nie na samym page view.

Stage 7 ma pozostać mały. Nie budujemy jeszcze BI, A/B testów, session replay, heatmap, marketing automation ani własnej platformy analitycznej.

---

## 2. Decyzja narzędziowa

### Wybrany provider: Umami Cloud EU

Dla FootQuiz wybieramy **Umami Cloud EU** jako główne narzędzie Analytics MVP.

Powody:
- obsługuje custom events,
- obsługuje funnels,
- obsługuje retention,
- jest prostsze niż PostHog dla małego MVP,
- ma privacy-first / cookieless podejście,
- można ograniczyć zakres danych wysyłanych do providera,
- provider nie musi być rozsiany po aplikacji dzięki małej warstwie abstrakcji,
- w razie potrzeby w przyszłości można przejść na bardziej rozbudowane rozwiązanie bez zmiany całej aplikacji.

### Dlaczego nie PostHog teraz

PostHog jest bardziej rozbudowany i może być lepszym wyborem później dla:
- A/B testów,
- feature flags,
- zaawansowanych cohort,
- eksperymentów onboardingowych,
- bardziej złożonej segmentacji.

Na etapie soft-launchu FootQuiz byłby jednak szerszy niż obecne potrzeby.

### Vercel Analytics

Nie jest częścią obowiązkowego Stage 7 MVP. Można go dodać później jako lekkie uzupełnienie ogólnego ruchu / Web Vitals, ale nie jest potrzebny do policzenia głównego lejka i retencji produktu.

---

## 3. Zasada implementacyjna

Kod aplikacji nie powinien bezpośrednio zależeć od API Umami w wielu miejscach.

Preferowana warstwa:

```ts
track(eventName, properties)
```

Przykładowo:

```ts
track('quiz_completed', {
  score: 4,
  total_questions: 5,
});
```

Provider ma być detalem implementacyjnym wewnątrz modułu analityki, np. `src/lib/analytics.ts`.

Dzięki temu późniejsza zmiana providera nie wymaga przepisywania komponentów quizu.

---

## 4. Anonymous identity

### Istniejąca gameplay identity

FootQuiz już posiada anonimową tożsamość do zabezpieczenia attempts:
- losowy sekret w HttpOnly cookie,
- SHA-256 tego sekretu przechowywany po stronie DB.

Tych wartości **nie wolno używać jako analytics identity**.

Nie wysyłamy do Umami:
- `footquiz-anon` / dev cookie,
- `anonymous_token_hash`,
- sekretów Supabase,
- username jako analytics identity.

### Analytics identity

Dla Analytics MVP preferowany jest **oddzielny, losowy `analytics_id`**, niezależny od gameplay identity.

Cel:
- pozwolić połączyć aktywność tego samego anonimowego gracza między dniami,
- nie mieszać domeny bezpieczeństwa gameplay z analityką,
- przygotować grunt pod późniejsze anonymous → authenticated identity linking.

`analytics_id` nie powinien dawać żadnego dostępu do quizu, attempts ani konta.

Szczegół mechanizmu persistence i integracji z Umami Distinct ID należy potwierdzić podczas implementacji Stage 7.

---

## 5. Minimalny event taxonomy

### `quiz_viewed`
**Moment:** użytkownik dotarł do widoku Daily Quiz.  
**Cel:** górna część lejka.

Minimalne properties:
- `challenge_date` lub równoważny bezpieczny identyfikator dnia,
- opcjonalnie źródło/UTM, jeśli jest już dostępne w warstwie analityki.

### `quiz_started`
**Moment:** backend potwierdził utworzenie lub wznowienie realnego attemptu i UI przechodzi do aktywnej gry.  
**Cel:** początek faktycznej aktywacji produktu.

Minimalne properties:
- `challenge_date`,
- `resumed`: boolean.

### `question_answered`
**Moment:** odpowiedź została zaakceptowana i utrwalona przez backend.  
**Cel:** mierzenie miejsca porzucenia quizu.

Minimalne properties:
- `question_number`: 1..5,
- `correct`: boolean,
- `timed_out`: boolean.

Nie wysyłamy:
- treści pytania,
- options,
- `selectedIndex`,
- `correctIndex`,
- explanation,
- `questionId`, jeśli nie jest niezbędny do analizy MVP.

### `quiz_completed`
**Moment:** backend potwierdził ukończony attempt / wynik jest dostępny jako completed state.  
**Cel:** najważniejszy event retencyjny.

Minimalne properties:
- `score`: 0..5,
- `total_questions`: 5.

Nie wysyłamy client-trusted czasu.

### `result_saved`
**Moment:** wynik został zapisany/finalized i użytkownik otrzymał potwierdzony rezultat.  
**Cel:** mierzenie completion → saved result.

Minimalne properties:
- `score`,
- `total_questions`.

Nie wysyłamy username.

### `leaderboard_viewed`
**Moment:** użytkownik zobaczył poprawnie załadowany ranking.  
**Cel:** zainteresowanie społeczną warstwą produktu.

### Eventy odłożone

`share_clicked` / `result_shared` trafiają do Stage 11 — Share / virality MVP, chyba że share flow zostanie wdrożony wcześniej.

`match_predicted`, streak events, Auth events i achievementy są poza Stage 7.

---

## 6. Funnel MVP

```text
quiz_viewed
→ quiz_started
→ question_answered #1
→ question_answered #2
→ question_answered #3
→ question_answered #4
→ question_answered #5
→ quiz_completed
→ result_saved
```

`question_number` pozwala używać jednego eventu zamiast pięciu nazw.

Najważniejsza metryka funnelowa:

```text
Completion Rate = quiz_completed / quiz_started
```

---

## 7. Definicja retencji

### Day 0 cohort
Do cohorty Day 0 wchodzi użytkownik, który po raz pierwszy wykonał `quiz_completed`.

### D1
**Core D1:** ten sam użytkownik wykonuje `quiz_completed` następnego dnia.

Pomocniczo:
**Return D1:** ten sam użytkownik wykonuje `quiz_started` następnego dnia.

### D7
**Core D7:** `quiz_completed` siódmego dnia po Day 0.

North Star dla FootQuiz pozostaje oparta przede wszystkim o **Core D1 / Core D7**.

---

## 8. Attribution / UTM

Minimalne parametry:
- `utm_source`,
- `utm_medium`,
- `utm_campaign`,
- opcjonalnie `utm_content`.

Na Stage 7 trzeba co najmniej zachować możliwość przypisania pierwszego / bieżącego źródła ruchu do eventów potrzebnych do podstawowej analizy kanałów.

Nie rozbudowujemy jeszcze attribution modelu ponad potrzeby soft-launchu.

---

## 9. Privacy / GDPR / ePrivacy

Zasady MVP:
- minimalizacja danych,
- brak PII,
- brak username w analytics,
- brak gameplay secretów i hashy,
- brak treści pytań i odpowiedzi,
- brak session replay,
- brak heatmaps,
- brak reklamowego profilowania,
- EU region providera.

Umami ma privacy-first / cookieless podejście, ale wdrożenie osobnego trwałego `analytics_id` do D1/D7 trzeba traktować jako osobną decyzję privacy.

Nie zapisujemy kategorycznego stwierdzenia „cookie banner nie jest potrzebny”. Przed publicznym ruchem należy sprawdzić finalny sposób persistence `analytics_id` i wynikające z niego obowiązki informacyjne / consent w kontekście Polski i UE.

---

## 10. Ochrona przed błędnymi eventami

Zasady:
- event failure nie blokuje quizu,
- trackowanie jest best-effort,
- Strict Mode / retry / refresh nie powinny generować oczywistych duplikatów kluczowych eventów,
- `quiz_started`, `question_answered`, `quiz_completed`, `result_saved` powinny być emitowane dopiero po potwierdzeniu odpowiedniej akcji przez backend,
- nie polegamy na kliknięciu klienta jako źródle prawdy dla ukończenia i wyniku.

---

## 11. Test plan Stage 7

Automatycznie / mocked:
- eventy wywołują się tylko w oczekiwanych stanach,
- retry nie duplikuje kluczowych eventów,
- safe properties whitelist,
- brak secretów / hashy / username / question content w payloadzie,
- analytics failure nie blokuje flow.

Manualnie:
- realne eventy pojawiają się w Umami Cloud EU,
- funnel ma prawidłową kolejność,
- jeden ukończony quiz generuje oczekiwany zestaw eventów,
- refresh/resume nie produkuje oczywistych duplikatów,
- payloady są przejrzane w DevTools,
- test powrotu tego samego `analytics_id` potwierdza możliwość liczenia D1.

---

## 12. Scope Stage 7

W Stage 7 implementujemy tylko:
- Umami Cloud EU,
- cienką warstwę `track(...)`,
- anonymous analytics identity,
- minimalne eventy produktu,
- funnel,
- D1/D7 retention,
- podstawowe UTM attribution.

Nie implementujemy:
- Auth,
- streaków,
- achievements,
- Typera Dnia,
- share flow,
- A/B tests,
- session replay,
- heatmaps,
- marketing automation,
- własnej hurtowni analytics,
- rozbudowanego BI.

---

## 13. Definition of Done

Stage 7 jest DONE, gdy:
- Umami Cloud EU działa w środowisku docelowym,
- kluczowe eventy są wysyłane bez danych wrażliwych,
- potrafimy zbudować funnel Daily Quiz,
- potrafimy policzyć Core D1 i Core D7 dla anonimowego użytkownika,
- źródło ruchu / UTM jest dostępne do podstawowej segmentacji,
- implementacja nie wpływa na niezawodność quizu,
- manualny dashboard smoke test przechodzi.
