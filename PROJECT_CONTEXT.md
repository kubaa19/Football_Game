# Projekt: FootQuiz (Asynchroniczny Quiz Piłkarski MVP)

## 1. Założenia biznesowe i prawne
- **Format:** Aplikacja webowa zoptymalizowana pod ekrany smartfonów (Mobile-First, Next.js + Tailwind CSS).
- **Kwestie prawne:** Pytania wyłącznie o fakty historyczne, statystyki i transfery (brak naruszeń praw autorskich do nazwisk i klubów). Bezwzględny brak oficjalnych herbów klubowych i płatnych zdjęć agencyjnych (Getty/Reuters) na start.
- **Model MVP:** Bez WebSockets i bez rywalizacji na żywo. Tryb asynchroniczny "Wyzwanie Dnia" (Daily 5 pytań, ten sam zestaw dla wszystkich danego dnia).
- **Kluczowa metryka (North Star Metric):** Retention Day 1 i Day 7 (docelowo > 25–30%). Na etapie MVP celem jest powracalność i budowa nawyku, nie natychmiastowa monetyzacja.
- **Strategia dystrybucji i promocji organicznej:** Zob. dedykowany dokument `docs/MARKETING_STRATEGY.md` (formaty wiralowe na X, WhatsApp Share, TikTok, fora klubowe).
---

## 2. Architektura techniczna
- **Frontend:** Next.js (App Router), React, Tailwind CSS, shadcn/ui.
- **Backend & Auth:** Supabase (PostgreSQL + Auth Google/Email + Row-Level Security).
- **Logika gry & Bezpieczeństwo:** Walidacja odpowiedzi po stronie serwera (Next.js Server Actions). Pole correct_index nigdy nie trafia do przeglądarki gracza przed udzieleniem odpowiedzi.
- **Płatności (od Etapu 3):** Merchant of Record (Paddle / Lemon Squeezy) lub Stripe Checkout.

---

## 3. Inspiracje Duolingo (Mechanizmy Psychologiczne)
1. **Streaks (Płomień serii):** Licznik kolejnych dni gry (np. 🔥 7). Utrzymanie passy wymaga ukończenia 1 wyzwania dziennie.
2. **Krótkie sesje (Micro-steps):** Dokładnie 5 pytań na sesję, szybki zastrzyk dopaminy w 1–2 minuty.
3. **Ligi tygodniowe (od v0.2):** Zamiast jednego globalnego rankingu, gracze trafiają do 30-osobowych grup ligowych (B-Klasa -> Okręgówka -> II Liga -> I Liga -> Ekstraklasa -> Liga Mistrzów) z awansami i spadkami w niedziele o 23:59.
4. **Streak Freeze & Serca (od v1.0):** Zamrożenie passy ratujące serię oraz limit serc/energii w trybach solo, stanowiące główną dźwignię monetyzacji.

---

## 4. Zakres MVP (Co wchodzi vs Co wycinamy)

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
- [ ] 1.1. Baza danych i Auth: Konfiguracja tabel w Supabase (profiles, questions, daily_challenges, daily_scores) z aktywnym RLS oraz logowania Google.
- [ ] 1.2. Ekran Pytania: Komponent interfejsu pojedynczego pytania w Next.js (timer 10s, pasek postępu 1/5, warianty A/B/C/D, blokada kliknięć, stan zielony/czerwony, feedback edukacyjny).
- [ ] 1.3. Pętla sesji dziennej: Przeprowadzenie gracza przez 5 pytań z rzędu z zapisem wyniku (score, time_spent) przez Server Action.
- [ ] 1.4. Ekran podsumowania i virality: Ekran końcowy z podsumowaniem, aktualizacją passy (streak 🔥) oraz generatorem kafelków do schowka: FootQuiz #142: 4/5 ⏱️ 24.8s 🟩🟩🟥🟩🟩 Pobijesz mnie? footquiz.pl.
- [ ] 1.5. Tabela wyników (Leaderboard): Dobowy ranking TOP 50 graczy wg liczby trafień i czasu odpowiedzi.
- [ ] 1.6. Analityka bezciasteczkowa (Privacy-First): Wdrożenie Vercel Analytics + śledzenie zdarzeń (quiz_started, quiz_completed, result_shared) oraz obsługa parametrów UTM (WhatsApp, X, fora) bez konieczności banera cookies. Szczegóły: zobacz plik `docs/specs/analytics-specification.md`.

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
- Prompt do zasilania bazy pytań: scripts/prompts/questions-generator.txt
- Skrypt walidacyjny (Sanity-Check): scripts/validate-questions.js