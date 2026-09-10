# Projekt: FootQuiz (Asynchroniczny Quiz Piłkarski MVP)

## 1. Założenia biznesowe i prawne
- **Format:** Aplikacja webowa zoptymalizowana pod ekrany smartfonów (Mobile-First, Next.js + Tailwind CSS).
- **Kwestie prawne:** Pytania wyłącznie o fakty historyczne, statystyki i transfery (brak naruszeń praw autorskich do nazwisk i klubów). Bezwzględny brak oficjalnych herbów klubowych i płatnych zdjęć agencyjnych (Getty/Reuters) na start.
- **Model MVP:** Bez WebSockets i bez rywalizacji na żywo. Tryb asynchroniczny "Wyzwanie Dnia" (Daily 5 pytań, ten sam zestaw dla wszystkich danego dnia).
- **Kluczowa metryka (North Star Metric):** Retention Day 1 i Day 7 (docelowo > 25–30%). Na etapie MVP celem jest powracalność i budowa nawyku, nie natychmiastowa monetyzacja.
- **Strategia dystrybucji i promocji organicznej:** Zob. dedykowany dokument `docs/MARKETING_STRATEGY.md` (formaty wiralowe na X, WhatsApp Share, TikTok, fora klubowe).
---

## 2. Aktualna architektura techniczna

Stan implementacji: 2026-09-10. Zakres docelowy MVP opisuje sekcja 4; nie jest on listą gotowych funkcji.

- **Frontend:** Next.js 16.3.4 (App Router), React 19.2.8, TypeScript 7.0.2 i Tailwind CSS 4.3.3 według lockfile. Własne komponenty i Lucide; shadcn/ui nie jest wdrożone. TypeScript: `strict`, `target: ES2017`, `moduleResolution: bundler`. Tailwind przez `@tailwindcss/postcss` i import CSS.
- **Backend:** Next.js Route Handlers/API, nie Server Actions. `GET /api/quiz/daily`, `POST /api/quiz/answer` oraz obie trasy zapisu (`/api/quiz/result`, `/quiz/result`) korzystają z Supabase po stronie serwera przez `SUPABASE_SECRET_KEY`.
- **Baza:** lokalny `supabase/schema.sql` definiuje `questions`, `daily_challenges`, `quiz_results`. Nie definiuje `profiles` ani `daily_scores`. Wyniki są zapisywane ze zwalidowanym nickiem; bez powiązania z zalogowanym użytkownikiem.
- **Auth i RLS:** logowanie Google/Email nie jest wdrożone. Repozytorium nie zawiera kompletnego, wersjonowanego zestawu polityk RLS i grantów. W ramach aktualizacji dokumentacji nie audytowano zdalnych polityk Supabase; lokalny schemat nie potwierdza ich stanu.
- **Daily Quiz:** dzień liczony w UTC, kolejność według `daily_challenges.question_ids`, timer klienta 15 s. API wymaga kompletnego zestawu, ale nie wymusza dokładnie pięciu pytań. Brak automatycznego tworzenia dziennych zestawów.
- **Odpowiedzi i wynik:** GET nie zwraca `correct_index` ani `explanation`. Endpoint odpowiedzi ujawnia `correctIndex` i wyjaśnienie po przesłaniu wyboru, również przy timeoutcie `-1`. Wspólny serwerowy `saveQuizResult` oblicza wynik z przesłanych wyborów; nie potwierdza, że są to pierwsze odpowiedzi gracza.
- **Stan interfejsu:** ranking TOP 10 (cel TOP 50); `time_taken` nie jest zapisywany. Streak `1` i rekord `5/5` na stronie głównej są placeholderami. Podsumowanie i udostępnianie używają lokalnych danych. Brak serwerowej sesji próby i ochrony przed wielokrotnym zapisem.
- **Pozostały dostęp Supabase:** ranking nadal czyta `quiz_results` bezpośrednio z klienta, a admin próbuje bezpośrednio dodawać pytania. Admin nie ma kontroli roli ani logowania w kodzie.
- **Analityka:** niewdrożona; istnieje tylko niewykorzystywany helper `trackEvent`.

Szczegóły: [Daily Quiz](docs/specs/daily-quiz.md), [bezpieczeństwo i dostęp do danych](docs/specs/security-and-data-access.md), [walidacja pytań](docs/specs/question-validation.md).

### Quiz attempts — warstwa DB gotowa, integracja aplikacji przed nami

- Migracja `supabase/migrations/20260910120000_quiz_attempts.sql` została wykonana bez błędu na developerskim Supabase. Dodaje `quiz_attempts`, `quiz_attempt_answers` oraz nullable `quiz_results.attempt_id` z FK i UNIQUE. Lokalne `schema.sql` nie zawiera tych dodatków; opisuje je migracja.
- RPC `record_quiz_attempt_answer(...)` zapisuje pierwszy zaakceptowany wybór przed zwróceniem feedbacku; odpowiedź jest projektowo immutable. `finish_quiz_attempt(...)` liczy wynik z utrwalonych odpowiedzi i transakcyjnie zapisuje `quiz_result` oraz kończy próbę. Nowe tabele mają RLS i brak dostępu `anon`/`authenticated`; RPC są przeznaczone dla `service_role`.
- **Frontend i istniejące API nie korzystają jeszcze z quiz_attempts. Stare flow nadal działa.** Nie jest to pełne wdrożenie produktowe ani ochrona obecnego flow przed poprawianiem wyborów i wielokrotnym zapisem.
- **Testy wykonane na developerskim Supabase:** `supabase/tests/quiz_attempts.sql` zakończył się bez błędu, potwierdzając m.in. constraints, odpowiedzi, timeout, kolejność, retry, finalizację, score/pattern, RLS i uprawnienia. Dodatkowo zweryfikowano końcowy ROLLBACK: oryginalny challenge wrócił na `2026-09-10`, a `fixture_questions = 0`, `fixture_attempts = 0`, `fixture_results = 0`.
- **Testy niewykonane:** współbieżność z dwóch niezależnych połączeń oraz injected-failure rollback pomiędzy INSERT `quiz_results` a UPDATE `completed_at`. Procedury: `supabase/tests/quiz_attempts-concurrency.md`. Wymagają izolowanej bazy i trwałych osobnych połączeń; wykonamy je później na lokalnym PostgreSQL/Supabase. Nie traktujemy ich jako potwierdzonych przez dotychczasowe testy ani przez zwykły końcowy ROLLBACK.
- **Następny etap:** anonimowa tożsamość przez HttpOnly cookie i `POST /api/quiz/attempt/start`; później przełączenie answer/result na `attemptId` i odpowiedzi utrwalane na serwerze.

---

## 3. Inspiracje Duolingo (Mechanizmy Psychologiczne)
1. **Streaks (Płomień serii):** Licznik kolejnych dni gry (np. 🔥 7). Utrzymanie passy wymaga ukończenia 1 wyzwania dziennie.
2. **Krótkie sesje (Micro-steps):** Dokładnie 5 pytań na sesję, szybki zastrzyk dopaminy w 1–2 minuty.
3. **Ligi tygodniowe (od v0.2):** Zamiast jednego globalnego rankingu, gracze trafiają do 30-osobowych grup ligowych (B-Klasa -> Okręgówka -> II Liga -> I Liga -> Ekstraklasa -> Liga Mistrzów) z awansami i spadkami w niedziele o 23:59.
4. **Streak Freeze & Serca (od v1.0):** Zamrożenie passy ratujące serię oraz limit serc/energii w trybach solo, stanowiące główną dźwignię monetyzacji.

---

## 4. Docelowy zakres MVP (Co wchodzi vs Co wycinamy)

Poniższa tabela opisuje cel produktu. Nie oznacza, że wszystkie funkcje są wdrożone; stan obecny znajduje się w sekcji 2 i statusach roadmapy.

| Co WCHODZI do MVP (v0.1) | Co WYCINAMY do wersji późniejszych (v0.2+) |
| :--- | :--- |
| Tryb "Wyzwanie Dnia" (Daily) – 5 pytań/dzień, identyczny zestaw dla każdego | Mikropłatności i integrację ze Stripe/Paddle |
| Płomień serii dni (Streak) za ukończenie wyzwania | Złożone talie kart i perki taktyczne |
| Kafelkowy generator wyniku (jak w Wordle: 🟩🟩🟥🟩🟩) do wklejenia na X/WhatsApp | Tryb 1v1 na żywo i WebSockets |
| Dobowy ranking TOP 50 graczy wg punktów i czasu | 30-osobowe ligi cotygodniowe i system awansów |
| Logowanie Google/Email (Supabase Auth) do zapisu profilu i passy | Sklep z przedmiotami i monety |
| Baza ~300 pytań zweryfikowanych merytorycznie | Dźwięki, zaawansowane animacje i 3D |

---

## 5. Plan wdrożenia iteracyjnego (Roadmapa dla Continue)

### Etap 1: Walidacja pętli gry (MVP v0.1)
- [ ] 1.1. Baza danych i Auth — **częściowo**. Działają `questions`, `daily_challenges`, `quiz_results` i integracja Supabase. Brak profili, logowania Google/Email oraz kompletnego, wersjonowanego RLS/grantów. `daily_scores` było nazwą planowaną; obecna tabela to `quiz_results`.
- [ ] 1.2. Ekran Pytania — **częściowo** względem pierwotnego zakresu. Działają postęp, opcje, blokada kliknięć, feedback i podświetlenie odpowiedzi. Obecny timer to 15 s, nie planowane 10 s; brak etykiet A/B/C/D. Timer nie jest weryfikowany przez serwer.
- [ ] 1.3. Pętla dzienna — **częściowo**. Działa pobieranie zestawu, przechodzenie pytań i zapis wyniku przez Route Handlers ze wspólną funkcją serwerową. Brak zapisu `time_taken`, wymuszenia pięciu pytań i serwerowej próby. Pierwotnie planowano Server Action i pole `time_spent`.
- [ ] 1.4. Podsumowanie i virality — **częściowo**. Działają podsumowanie, kafelki, Web Share i schowek. Brak rzeczywistego streaka, czasu oraz numeru wyzwania w docelowym formacie udostępniania.
- [ ] 1.5. Ranking — **częściowo**. Obecnie TOP 10; cel to TOP 50 według trafień i czasu. Zapytanie sortuje także po `time_taken`, ale aplikacja nie zapisuje tego pola.
- [ ] 1.6. Analityka — **niewykonane**. Brak integracji Vercel Analytics/Umami/PostHog, wywołań zdarzeń i UTM w udostępnianiu. Istnieje tylko helper. Plan: `src/docs/specs/analytics-specification.md`.

### Etap 2: Grywalizacja i retencja w stylu Duolingo (v0.2)
- [ ] 2.1. Cotygodniowe 30-osobowe Ligi: Dynamiczne grupowanie graczy w ligach (B-Klasa do Ligi Mistrzów) z mechaniką awansów (TOP 5) i spadków (Bottom 5) w każdą niedzielę.
- [ ] 2.2. System Energii (Serca): Wskaźnik energii (3–5 serc). Zużycie 1 serca za błędną odpowiedź w trybie ciągłym, regeneracja +1 serce co 30 minut.
- [ ] 2.3. Tryb "Wieża Mistrzów" (Endless/Solo): Wspinaczka solo po drabince pytań (poziomy trudności 1–3) do utraty wszystkich serc.
- [ ] **2.4. Moduł Typera Dnia (Daily Match Predictor):** 1 darmowy mecz dziennie (1/X/2). W tygodniu nagroda standardowa (+25 XP), w weekendy "Hit Kolejki" z podwójną nagrodą (Super Boost: +50 XP / darmowe serce). Rozliczanie automatyczne o północy. Odbiór nagrody wymaga wejścia do aplikacji kolejnego dnia (podwójna pętla retencji). Całkowity brak stawek pieniężnych – w 100% bezpieczne prawnie bez 18+.
  - *Automatyzacja:* Dobór meczów algorytmem Hype Score, automatyczne rozliczanie o 23:30 oraz system awaryjny (alert e-mail przez Resend + szybki link do ręcznego zatwierdzenia wyniku).
  - *Szczegółowa specyfikacja techniczna i schemat bazy:* zobacz plik `docs/specs/daily-match-predictor.md`.


### Etap 3: Monetyzacja i karty (v1.0)
- [ ] 3.1. Waluta w grze i portfel: Tabela user_wallets przechowująca wirtualne monety.
- [ ] 3.2. Przedmioty użytkowe: Możliwość zakupu Zamrożenia Serii (Streak Freeze) oraz kół ratunkowych (VAR, 50/50, Dodatkowy Czas).
- [ ] 3.3. Sklep i integracja płatności: Obsługa zakupu pakietów waluty (np. 19 PLN, 29 PLN) przez Lemon Squeezy / Paddle lub Stripe Checkout z obsługą webhooków.

---

## 6. Wytyczne monetyzacji, prawne i podatkowe (Post-MVP)
- **Model sprzedaży:** Sprzedaż wyłącznie pakietów wirtualnej waluty / karnetów (np. 19 PLN, 29 PLN), a NIE mikropłatności za 1-2 PLN (ochrona marży przed prowizją stałą pośrednika typu 1 PLN / 0.50 USD).
- **Rekomendowany pośrednik:**
  - Opcja A (Merchant of Record - Paddle / Lemon Squeezy): 5% + 0.50 USD – zdejmuje problem rozliczania globalnego VAT/VAT-OSS i fakturowania B2C.
  - Opcja B (Stripe): ~1.5% + 1 PLN – niższa prowizja, ale wymaga samodzielnej obsługi księgowej i podatkowej (VAT-OSS przy sprzedaży w UE).
- **Zgodność z US (Polska):**
  - Sprzedaż monet/energii to usługi świadczone drogą elektroniczną (B2C).
  - Płatności bezgotówkowe z ewidencją w bazie zwalniają z konieczności posiadania fizycznej kasy fiskalnej.
  - Start możliwy na działalności nierejestrowanej (do ustawowego limitu miesięcznego przychodu), docelowo jednoosobowa działalność gospodarcza (JDG).

---

## 7. Struktura danych pytań (JSON)
Pojedynczy rekord w bazie i seedzie danych:
- category: string ("transfers", "records", "champions_league", etc.)
- difficulty: integer (1-3)
- question: string (treść pytania)
- options: string[] (dokładnie 4 unikalne opcje)
- correct_index: integer (0-3)
- explanation: string (krótkie wyjaśnienie faktu)
- tags: string[]

Pliki pomocnicze w projekcie:
- Prompt do zasilania bazy pytań: src/scripts/question-generator.txt
- Skrypt walidacyjny (Sanity-Check): src/scripts/prompts/validate-questions.js

### Pipeline jakości pytań

`generator → walidacja techniczna → ręczna kontrola merytoryczna → import do Supabase`

- Generator: `src/scripts/question-generator.txt`.
- Walidator techniczny: `src/scripts/prompts/validate-questions.js`.
- Specyfikacja i decyzje projektowe: `docs/specs/question-validation.md`.

**Przejście validate-questions.js NIE oznacza potwierdzenia poprawności merytorycznej.** Na MVP każde pytanie wymaga ręcznej kontroli faktów przed importem. Automatyczny Etap 2 pozostaje planowany; wrócimy do niego, gdy ręczna kontrola stanie się wąskim gardłem.
