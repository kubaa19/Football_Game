**# Projekt: FootQuiz (Asynchroniczny Quiz Piłkarski MVP)**

**## 1. Założenia biznesowe i prawne**

\- **\*\*Format:\*\*** Aplikacja webowa zoptymalizowana pod ekrany smartfonów (Mobile-First, Next.js + Tailwind CSS).

\- **\*\*Kwestie prawne:\*\*** Pytania wyłącznie o fakty historyczne, statystyki i transfery (brak naruszeń praw autorskich do nazwisk i klubów). Bezwzględny brak oficjalnych herbów klubowych i płatnych zdjęć agencyjnych (Getty/Reuters) na start.

\- **\*\*Model MVP:\*\*** Bez WebSockets i bez rywalizacji na żywo. Tryb asynchroniczny "Wyzwanie Dnia" (Daily 5 pytań, ten sam zestaw dla wszystkich danego dnia).

\- **\*\*Kluczowa metryka (North Star Metric):\*\*** Retention Day 1 i Day 7 (docelowo > 25–30%). Na etapie MVP celem jest powracalność i budowa nawyku, nie natychmiastowa monetyzacja.

\- **\*\*Strategia dystrybucji i promocji organicznej:\*\*** Zob. dedykowany dokument \`docs/MARKETING\_STRATEGY.md\` (formaty wiralowe na X, WhatsApp Share, TikTok, fora klubowe).

\---

**## 2. Aktualna architektura techniczna**

Stan implementacji: 2026-09-10. Zakres docelowy MVP opisuje sekcja 4; nie jest on listą gotowych funkcji.

\- **\*\*Frontend:\*\*** Next.js 16.3.4 (App Router), React 19.2.8, TypeScript 7.0.2 i Tailwind CSS 4.3.3 według lockfile. Własne komponenty i Lucide; shadcn/ui nie jest wdrożone. TypeScript: \`strict\`, \`target: ES2017\`, \`moduleResolution: bundler\`. Tailwind przez \`@tailwindcss/postcss\` i import CSS.

\- **\*\*Backend:\*\*** Next.js Route Handlers/API, nie Server Actions. \`GET /api/quiz/daily\`, \`POST /api/quiz/attempt/start\` i \`POST /api/quiz/answer\` korzystają z Supabase po stronie serwera przez \`SUPABASE\_SECRET\_KEY\`. Stare trasy zapisu wyniku (\`/api/quiz/result\`, \`/quiz/result\`) nadal istnieją, ale nowy flow attempts nie wywołuje ich.

\- **\*\*Baza:\*\*** lokalny \`supabase/schema.sql\` definiuje \`questions\`, \`daily\_challenges\`, \`quiz\_results\`. Nie definiuje \`profiles\` ani \`daily\_scores\`. Wyniki są zapisywane ze zwalidowanym nickiem; bez powiązania z zalogowanym użytkownikiem.

\- **\*\*Auth i RLS:\*\*** logowanie Google/Email nie jest wdrożone. Repozytorium nie zawiera kompletnego, wersjonowanego zestawu polityk RLS i grantów. W ramach aktualizacji dokumentacji nie audytowano zdalnych polityk Supabase; lokalny schemat nie potwierdza ich stanu.

\- **\*\*Daily Quiz:\*\*** dzień liczony w UTC, kolejność według \`daily\_challenges.question\_ids\`, timer klienta 15 s. API wymaga kompletnego zestawu, ale nie wymusza dokładnie pięciu pytań. Brak automatycznego tworzenia dziennych zestawów.

\- **\*\*Odpowiedzi i wynik:\*\*** GET nie zwraca \`correct\_index\` ani \`explanation\`. Nowy flow tworzy/wznawia próbę przez \`POST /api/quiz/attempt/start\`; \`POST /api/quiz/answer\` wymaga \`attemptId\` i utrwala pierwszą zaakceptowaną odpowiedź przez RPC przed zwróceniem feedbacku. \`ready_to_finish\` nie finalizuje jeszcze wyniku. Stary \`saveQuizResult\` nadal istnieje, ale nie jest używany przez nowy frontend attempts.

\- **\*\*Stan interfejsu:\*\*** frontend Daily Quiz jest zintegrowany z serwerową próbą: start/resume pochodzi z \`/api/quiz/attempt/start\`, odpowiedzi z serwera są źródłem prawdy, a stare lokalne wyniki nie sterują postępem. Po 5 odpowiedziach UI pokazuje \`ready_to_finish\` bez starego zapisu i bez opcji „Powtórz”. Ranking nadal jest TOP 10 (cel TOP 50); \`time_taken\` nie jest zapisywany. Streak \`1\` i rekord \`5/5\` na stronie głównej pozostają placeholderami.

\- **\*\*Pozostały dostęp Supabase:\*\*** ranking nadal czyta \`quiz\_results\` bezpośrednio z klienta, a admin próbuje bezpośrednio dodawać pytania. Admin nie ma kontroli roli ani logowania w kodzie.

\- **\*\*Analityka:\*\*** niewdrożona; istnieje tylko niewykorzystywany helper \`trackEvent\`.

Szczegóły: [Daily Quiz]\(docs/specs/daily-quiz.md), [bezpieczeństwo i dostęp do danych]\(docs/specs/security-and-data-access.md), [walidacja pytań]\(docs/specs/question-validation.md).

**### Quiz attempts — DB + start/answer API + frontend integration gotowe; finalizacja przed nami**

\- Migracja \`supabase/migrations/20260910120000_quiz_attempts.sql\` została wykonana bez błędu na developerskim Supabase. Dodaje \`quiz_attempts\`, \`quiz_attempt_answers\` oraz nullable \`quiz_results.attempt_id\` z FK i UNIQUE. Lokalne \`schema.sql\` nie zawiera tych dodatków; opisuje je migracja.

\- RPC \`record_quiz_attempt_answer(...)\` zapisuje pierwszy zaakceptowany wybór przed zwróceniem feedbacku; odpowiedź jest projektowo immutable. Identyczny retry jest idempotentny. \`finish_quiz_attempt(...)\` jest już zaimplementowane w DB i potrafi transakcyjnie policzyć wynik z utrwalonych odpowiedzi, zapisać \`quiz_result\` oraz zakończyć próbę, ale **nie jest jeszcze podłączone do flow aplikacji**.

\- Anonimowa tożsamość działa przez HttpOnly cookie i jego SHA-256 hash przechowywany po stronie serwera. \`POST /api/quiz/attempt/start\` tworzy albo wznawia próbę i zwraca autorytatywny stan: \`attemptId\`, kolejność pytań, utrwalone odpowiedzi, \`nextQuestionId\`, stan próby i — dla zakończonej próby — wynik.

\- \`POST /api/quiz/answer\` wymaga \`attemptId\`, \`questionId\` i \`selectedIndex\`; korzysta wyłącznie z RPC \`record_quiz_attempt_answer\`. Frontend nie oblicza poprawności samodzielnie. Przy niepewnym zapisie użytkownik może ponowić ten sam wybór albo zsynchronizować próbę, ale nie zmienić odpowiedzi.

\- **\*\*Frontend jest zintegrowany z quiz attempts.\*\*** \`quiz/page.tsx\` uruchamia start/resume, porównuje zestaw z \`/api/quiz/daily\` i odtwarza postęp z serwera. \`attemptId\` nie jest źródłem prawdy w localStorage. Utrwalone odpowiedzi serwera sterują resume; stare klucze localStorage nie są importowane do próby ani nie nadpisują serwera.

\- \`QuestionScreen\` zapisuje odpowiedź z \`attemptId\`; potwierdzona odpowiedź trafia do stanu po sukcesie \`/answer\`, a „Następne” jedynie zmienia ekran. \`replayed=true\` jest traktowane jak zwykły sukces bez podwójnego naliczenia.

\- Po komplecie odpowiedzi stan \`ready_to_finish\` pokazuje podsumowanie, ale nie udaje \`completed\`. W trybie attempts \`SummaryScreen\` nie wywołuje starego endpointu wyniku i nie pokazuje „Powtórz”. **Brakującym elementem jest podłączenie finalizacji do \`finish_quiz_attempt\`.**

\- **\*\*Weryfikacja Etapu 3:\*\*** pełny typecheck PASS, \`npm.cmd run build\` PASS, lokalny zestaw testów 28/28 PASS oraz \`git diff --check\` bez błędów. Manualnie potwierdzono: normalny answer/feedback/next, resume po F5 po dwóch odpowiedziach, F5 podczas feedbacku przechodzące do pierwszego nierozwiązanego pytania oraz dojście do 5/5 z poprawnym podsumowaniem \`ready_to_finish\`, bez starego zapisu wyniku i bez „Powtórz”. Szczegóły: \`docs/testing.md\`.

\- **\*\*Testy nadal niewykonane / odłożone:\*\*** m.in. pełna macierz błędów cookie/Origin/request, rzeczywista współbieżność dwóch niezależnych sesji, injected-failure rollback między INSERT \`quiz_results\` a UPDATE \`completed_at\`, część scenariuszy utraty sieci/timera i produktowa finalizacja przez \`finish_quiz_attempt\`. Testy współbieżności/atomicity wymagające izolowanej bazy pozostają odłożone.

\- **\*\*Następny etap:\*\*** dodać bezpieczny endpoint finalizacji próby oparty na \`finish_quiz_attempt\`, podłączyć \`ready_to_finish → completed\`, a następnie przetestować idempotentną finalizację i resume zakończonej próby.

\---

**## 3. Inspiracje Duolingo (Mechanizmy Psychologiczne)**

1\. **\*\*Streaks (Płomień serii):\*\*** Licznik kolejnych dni gry (np. 🔥 7). Utrzymanie passy wymaga ukończenia 1 wyzwania dziennie.

2\. **\*\*Krótkie sesje (Micro-steps):\*\*** Dokładnie 5 pytań na sesję, szybki zastrzyk dopaminy w 1–2 minuty.

3\. **\*\*Ligi tygodniowe (od v0.2):\*\*** Zamiast jednego globalnego rankingu, gracze trafiają do 30-osobowych grup ligowych (B-Klasa -> Okręgówka -> II Liga -> I Liga -> Ekstraklasa -> Liga Mistrzów) z awansami i spadkami w niedziele o 23:59.

4\. **\*\*Streak Freeze & Serca (od v1.0):\*\*** Zamrożenie passy ratujące serię oraz limit serc/energii w trybach solo, stanowiące główną dźwignię monetyzacji.

\---

**## 4. Docelowy zakres MVP (Co wchodzi vs Co wycinamy)**

Poniższa tabela opisuje cel produktu. Nie oznacza, że wszystkie funkcje są wdrożone; stan obecny znajduje się w sekcji 2 i statusach roadmapy.

\| Co WCHODZI do MVP (v0.1) | Co WYCINAMY do wersji późniejszych (v0.2+) |

\| :--- | :--- |

\| Tryb "Wyzwanie Dnia" (Daily) – 5 pytań/dzień, identyczny zestaw dla każdego | Mikropłatności i integrację ze Stripe/Paddle |

\| Płomień serii dni (Streak) za ukończenie wyzwania | Złożone talie kart i perki taktyczne |

\| Kafelkowy generator wyniku (jak w Wordle: 🟩🟩🟥🟩🟩) do wklejenia na X/WhatsApp | Tryb 1v1 na żywo i WebSockets |

\| Dobowy ranking TOP 50 graczy wg punktów i czasu | 30-osobowe ligi cotygodniowe i system awansów |

\| Logowanie Google/Email (Supabase Auth) do zapisu profilu i passy | Sklep z przedmiotami i monety |

\| Baza \~300 pytań zweryfikowanych merytorycznie | Dźwięki, zaawansowane animacje i 3D |

\---

**## 5. Plan wdrożenia iteracyjnego (Roadmapa dla Continue)**

**### Etap 1: Walidacja pętli gry (MVP v0.1)**

\- [ ] 1.1. Baza danych i Auth — **\*\*częściowo\*\***. Działają \`questions\`, \`daily\_challenges\`, \`quiz\_results\` i integracja Supabase. Brak profili, logowania Google/Email oraz kompletnego, wersjonowanego RLS/grantów. \`daily\_scores\` było nazwą planowaną; obecna tabela to \`quiz\_results\`.

\- [ ] 1.2. Ekran Pytania — **\*\*częściowo\*\*** względem pierwotnego zakresu. Działają postęp, opcje, blokada kliknięć, feedback i podświetlenie odpowiedzi. Obecny timer to 15 s, nie planowane 10 s; brak etykiet A/B/C/D. Timer nie jest weryfikowany przez serwer.

\- [ ] 1.3. Pętla dzienna — **\*\*częściowo\*\***. Działają pobieranie zestawu, serwerowa próba anonimowa, start/resume oraz immutable zapis pierwszych odpowiedzi przez Route Handlers + RPC. Frontend odtwarza postęp z serwera. Brak jeszcze produktowej finalizacji przez \`finish_quiz_attempt\`, zapisu \`time_taken\` i wymuszenia dokładnie pięciu pytań przez API.

\- [ ] 1.4. Podsumowanie i virality — **\*\*częściowo\*\***. Działają podsumowanie, kafelki, Web Share i schowek. Brak rzeczywistego streaka, czasu oraz numeru wyzwania w docelowym formacie udostępniania.

\- [ ] 1.5. Ranking — **\*\*częściowo\*\***. Obecnie TOP 10; cel to TOP 50 według trafień i czasu. Zapytanie sortuje także po \`time\_taken\`, ale aplikacja nie zapisuje tego pola.

\- [ ] 1.6. Analityka — **\*\*niewykonane\*\***. Brak integracji Vercel Analytics/Umami/PostHog, wywołań zdarzeń i UTM w udostępnianiu. Istnieje tylko helper. Plan: \`src/docs/specs/analytics-specification.md\`.

**### Etap 2: Grywalizacja i retencja w stylu Duolingo (v0.2)**

\- [ ] 2.1. Cotygodniowe 30-osobowe Ligi: Dynamiczne grupowanie graczy w ligach (B-Klasa do Ligi Mistrzów) z mechaniką awansów (TOP 5) i spadków (Bottom 5) w każdą niedzielę.

\- [ ] 2.2. System Energii (Serca): Wskaźnik energii (3–5 serc). Zużycie 1 serca za błędną odpowiedź w trybie ciągłym, regeneracja +1 serce co 30 minut.

\- [ ] 2.3. Tryb "Wieża Mistrzów" (Endless/Solo): Wspinaczka solo po drabince pytań (poziomy trudności 1–3) do utraty wszystkich serc.

\- [ ] **\*\*2.4. Moduł Typera Dnia (Daily Match Predictor):\*\*** 1 darmowy mecz dziennie (1/X/2). W tygodniu nagroda standardowa (+25 XP), w weekendy "Hit Kolejki" z podwójną nagrodą (Super Boost: +50 XP / darmowe serce). Rozliczanie automatyczne o północy. Odbiór nagrody wymaga wejścia do aplikacji kolejnego dnia (podwójna pętla retencji). Całkowity brak stawek pieniężnych – w 100% bezpieczne prawnie bez 18+.

  - *\*Automatyzacja:\** Dobór meczów algorytmem Hype Score, automatyczne rozliczanie o 23:30 oraz system awaryjny (alert e-mail przez Resend + szybki link do ręcznego zatwierdzenia wyniku).

  - *\*Szczegółowa specyfikacja techniczna i schemat bazy:\** zobacz plik \`docs/specs/daily-match-predictor.md\`.



**### Etap 3: Monetyzacja i karty (v1.0)**

\- [ ] 3.1. Waluta w grze i portfel: Tabela user\_wallets przechowująca wirtualne monety.

\- [ ] 3.2. Przedmioty użytkowe: Możliwość zakupu Zamrożenia Serii (Streak Freeze) oraz kół ratunkowych (VAR, 50/50, Dodatkowy Czas).

\- [ ] 3.3. Sklep i integracja płatności: Obsługa zakupu pakietów waluty (np. 19 PLN, 29 PLN) przez Lemon Squeezy / Paddle lub Stripe Checkout z obsługą webhooków.

\---

**## 6. Wytyczne monetyzacji, prawne i podatkowe (Post-MVP)**

\- **\*\*Model sprzedaży:\*\*** Sprzedaż wyłącznie pakietów wirtualnej waluty / karnetów (np. 19 PLN, 29 PLN), a NIE mikropłatności za 1-2 PLN (ochrona marży przed prowizją stałą pośrednika typu 1 PLN / 0.50 USD).

\- **\*\*Rekomendowany pośrednik:\*\***

  - Opcja A (Merchant of Record - Paddle / Lemon Squeezy): 5% + 0.50 USD – zdejmuje problem rozliczania globalnego VAT/VAT-OSS i fakturowania B2C.

  - Opcja B (Stripe): \~1.5% + 1 PLN – niższa prowizja, ale wymaga samodzielnej obsługi księgowej i podatkowej (VAT-OSS przy sprzedaży w UE).

\- **\*\*Zgodność z US (Polska):\*\***

  - Sprzedaż monet/energii to usługi świadczone drogą elektroniczną (B2C).

  - Płatności bezgotówkowe z ewidencją w bazie zwalniają z konieczności posiadania fizycznej kasy fiskalnej.

  - Start możliwy na działalności nierejestrowanej (do ustawowego limitu miesięcznego przychodu), docelowo jednoosobowa działalność gospodarcza (JDG).

\---

**## 7. Struktura danych pytań (JSON)**

Pojedynczy rekord w bazie i seedzie danych:

\- category: string ("transfers", "records", "champions\_league", etc.)

\- difficulty: integer (1-3)

\- question: string (treść pytania)

\- options: string[] (dokładnie 4 unikalne opcje)

\- correct\_index: integer (0-3)

\- explanation: string (krótkie wyjaśnienie faktu)

\- tags: string[]

Pliki pomocnicze w projekcie:

\- Prompt do zasilania bazy pytań: src/scripts/question-generator.txt

\- Skrypt walidacyjny (Sanity-Check): src/scripts/prompts/validate-questions.js

**### Pipeline jakości pytań**

\`generator → walidacja techniczna → ręczna kontrola merytoryczna → import do Supabase\`

\- Generator: \`src/scripts/question-generator.txt\`.

\- Walidator techniczny: \`src/scripts/prompts/validate-questions.js\`.

\- Specyfikacja i decyzje projektowe: \`docs/specs/question-validation.md\`.

**\*\*Przejście validate-questions.js NIE oznacza potwierdzenia poprawności merytorycznej.\*\*** Na MVP każde pytanie wymaga ręcznej kontroli faktów przed importem. Automatyczny Etap 2 pozostaje planowany; wrócimy do niego, gdy ręczna kontrola stanie się wąskim gardłem.