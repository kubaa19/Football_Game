# Specyfikacja Techniczna: Moduł Typera Dnia (Daily Match Predictor)

## 1. Cel biznesowy i pętla gry
- Zapewnienie graczowi 2-minutowego rytuału dziennego: rano rozwiązanie quizu i wytypowanie meczu (1/X/2), wieczorem/kolejnego dnia powrót po odbiór nagrody.
- Zwiększenie zaangażowania w weekendy poprzez mechanizm "Hit Kolejki" (Super Boost: podwójne XP / darmowe serce).
- Status prawny: brak opłat i brak nagród rzeczowych (wyłącznie darmowe punkty XP/serca w grze) – brak klasyfikacji jako hazard, brak konieczności weryfikacji 18+.

---

## 2. Architektura danych (Baza PostgreSQL w Supabase)

### Tabela: `daily_matches`
- `id`: uuid (Primary Key)
- `external_api_id`: integer (ID meczu z API piłkarskiego)
- `match_date`: date (Data meczu, np. '2026-09-08')
- `home_team`: string (Nazwa gospodarzy, np. 'Arsenal')
- `away_team`: string (Nazwa gości, np. 'Chelsea')
- `league_name`: string (np. 'Premier League')
- `kickoff_time`: timestamptz (Dokładna godzina rozpoczęcia – blokada typowania)
- `status`: string ('scheduled' | 'finished' | 'postponed' | 'manual_review')
- `result`: string ('1' | 'X' | '2' | null)
- `is_weekend_boost`: boolean (Domyślnie true dla sobót i niedziel)
- `created_at`: timestamptz

### Tabela: `match_predictions`
- `id`: uuid (Primary Key)
- `user_id`: uuid (Foreign Key do `profiles.id`)
- `match_id`: uuid (Foreign Key do `daily_matches.id`)
- `predicted_outcome`: string ('1' | 'X' | '2')
- `is_settled`: boolean (Domyślnie false)
- `is_won`: boolean (null do czasu rozliczenia)
- `reward_claimed`: boolean (Domyślnie false – wymaga wejścia użytkownika)
- `created_at`: timestamptz
- *Ograniczenie:* Unikalność pary `(user_id, match_id)` – 1 typ na użytkownika dziennie.

---

## 3. Algorytm wyboru Meczu Dnia (Hype Score)

Skrypt uruchamiany codziennie o 03:00 UTC (Cron 1).

### Formuła:
`Hype Score = Punkty_Ligi + Punkty_Tabeli - Kara_Rotacji`

1. **Wagi ligowe (Punkty_Ligi):**
   - 100 pkt: Liga Mistrzów (faza pucharowa / hity grupowe), Premier League, La Liga.
   - 75 pkt: Serie A, Bundesliga, Ekstraklasa.
   - 45 pkt: Liga Europy, Liga Konferencji, Ligue 1.
2. **Stawka meczu (Punkty_Tabeli):**
   - Obliczana na podstawie sumy pozycji w tabeli:
     - Suma <= 5 (np. 1. vs 2., 1. vs 4.): +50 pkt.
     - Suma 6–10 (mecz o europejskie puchary): +30 pkt.
     - Suma > 18: 0 pkt.
3. **Filtr rotacji (Kara_Rotacji):**
   - Jeśli któraś z drużyn brała udział w Typerze w ciągu ostatnich 5 dni: -60 pkt.
4. **Wybór:**
   - Wybierany jest mecz z najwyższym wynikiem końcowym.
   - Jeśli w dany dzień brak meczów z min. progiem 40 pkt (np. przerwa na kadrę): wybierany jest najwyżej oceniony mecz reprezentacji / fallback informacyjny.

---

## 4. Automatyzacja i obsługa błędów (Resend Fallback)

### Cron 2: Rozliczanie (23:30 UTC)
1. Skrypt sprawdza status meczu w API piłkarskim (`football-data.org` lub `API-Football`).
2. **Ścieżka sukcesu (Status: FINISHED):**
   - Wyznaczenie rezultatu (np. 2:1 -> '1').
   - Aktualizacja tabeli `daily_matches`: `status = 'finished'`, `result = '1'`.
   - Masowy update tabeli `match_predictions`:
     - Dla trafionych: `is_settled = true`, `is_won = true`.
     - Dla nietrafionych: `is_settled = true`, `is_won = false`.
3. **Ścieżka błędu (API nie odpowiada / mecz nie ma statusu FINISHED po 23:30):**
   - Status meczu w bazie zmienia się na `manual_review`.
   - Wysyłka e-maila przez **Resend API** na adres administratora.
   - E-mail zawiera bezpośredni Magic Link z jednorazowym tokenem bezpieczeństwa:
     `https://app.footquiz.pl/api/admin/settle-match?match_id={ID}&token={ADMIN_SECRET_TOKEN}`
   - Pod linkiem znajduje się minimalistyczny widok z trzema przyciskami: `[ Wygrał Gospodarz ]`, `[ Remis ]`, `[ Wygrał Gość ]`. Kliknięcie natychmiast odpala procedurę rozliczenia punktów.

---

## 5. Integracja z profilem gracza (Pętla retencji)
- Gracz po wejściu do aplikacji kolejnego dnia widzi w widoku głównym powiadomienie (banner/modal):
  *„Twój typ na mecz Arsenal vs Chelsea okazał się celny! Odbierz +25 XP / +1 Serce”*.
- Kliknięcie przycisku zmienia flagę `reward_claimed = true` i dodaje punkty do konta profilu.