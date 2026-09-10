# Bezpieczeństwo i dostęp do danych

## Stan obecny i granica zaufania

Opis kodu repozytorium na 2026-09-10. Dane klienta, localStorage i blokady UI nie są zaufanym źródłem wyniku ani dowodem przebiegu gry.

`src/lib/supabase.ts` tworzy klienta z `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Są to wartości dostępne przeglądarce, a nie sekrety serwerowe. Ranking nadal odczytuje `quiz_results` bezpośrednio przez tego klienta. Panel admina próbuje bezpośrednio dodawać rekordy do `questions`.

Route Handlers quizu używają `SUPABASE_SECRET_KEY` wyłącznie na serwerze. Klucz nie jest przekazywany do UI ani umieszczany w zmiennej NEXT_PUBLIC. Klient serwerowy ma wyłączone utrwalanie i odświeżanie sesji. Wspólna funkcja zapisu ma import `server-only`.

Klucz serwerowy omija RLS, dlatego endpointy same ograniczają odczyt do dzisiejszego challenge i walidują wejście. Nie należy traktować RLS jako zastępstwa tych kontroli.

## Ochrona odpowiedzi

`GET /api/quiz/daily` odczytuje i zwraca wyłącznie publiczną listę pól: `id`, `category`, `difficulty`, `question`, `options`, `tags`. Nie udostępnia `correct_index` ani `explanation`; pobieranie pytań quizu nie wymaga bezpośredniego dostępu anon do tabel pytań i wyzwań.

`POST /api/quiz/answer` sprawdza format wejścia i przynależność pytania do dzisiejszego zestawu, zanim pobierze rozwiązanie. Dopiero odpowiedź tego endpointu ujawnia `correctIndex` i `explanation`, również dla błędnej odpowiedzi i timeoutu -1.

Jest to kontrola kontraktu API, nie dowód zabezpieczenia wszystkich ścieżek dostępu do zdalnej bazy. RLS ogranicza wiersze; samo pomijanie kolumn w klienckim SELECT nie zabezpiecza ich przed innym zapytaniem.

## Serwerowe przeliczanie wyniku

`/api/quiz/result` i `/quiz/result` korzystają z jednej funkcji `src/server/saveQuizResult.ts`.

Serwer przyjmuje tylko zwalidowany nick oraz odpowiedzi z UUID i indeksem -1..3. Odrzuca dodatkowe pola starego kontraktu, duplikaty i niepełny lub obcy zestaw. Poprawne indeksy pobiera z bazy, kolejność odtwarza z challenge i sam oblicza `score`, `total_questions`, `answers_pattern` oraz datę UTC. Zapis trafia do `quiz_results`.

To usuwa możliwość bezpośredniego zadeklarowania punktacji, lecz nie potwierdza pierwszych wyborów gracza. Endpoint odpowiedzi nie zapisuje historii; wynik jest obliczany z listy przesłanej dopiero przy zapisie.

## Auth i stan RLS wynikający z repozytorium

Auth Google/Email, profile i kontrola roli administratora nie są wdrożone. Nick jest walidowanym tekstem, nie tożsamością użytkownika. Pole `quiz_results.user_id` istnieje w schemacie jako opcjonalne odwołanie do `auth.users`, ale zapis go nie wypełnia.

`supabase/schema.sql` definiuje `questions`, `daily_challenges`, `quiz_results` i indeks rankingu. Nie zawiera kompletnego zestawu poleceń włączających RLS, polityk ani grantów. Nie można na tej podstawie stwierdzić, że zdalne RLS jest wyłączone lub poprawnie skonfigurowane.

**W tym kroku nie wykonaliśmy audytu zdalnych polityk Supabase.** Wcześniejsze odczyty pokazywały różną widoczność danych dla klucza publicznego i serwerowego; nie stanowią one pełnego audytu polityk, widoków, funkcji i grantów. Dokumentacja nie zastępuje wersjonowanej konfiguracji bazy.

## Znane luki / TODO

- Brak serwerowej sesji/próby quizu; `quiz_attempts` nie istnieje.
- Możliwość poznania rozwiązania przez endpoint odpowiedzi i późniejszego przesłania poprawionych wyborów do zapisu.
- Brak ochrony przed wielokrotną próbą, zapisem, powtórzeniem żądania i brak idempotencji. Stan UI/localStorage można ominąć.
- Brak trwałego `challenge_id`, wersji zestawu i historii odpowiedzi w `quiz_results`; pozostaje data i wzór bitowy.
- Brak Auth i potwierdzenia właściciela nicku.
- Niezabezpieczony admin: brak logowania/kontroli roli w kodzie. Skuteczność bezpośredniego INSERT zależy od zdalnych uprawnień, których tutaj nie potwierdzamy.
- Ranking nadal korzysta bezpośrednio z Supabase i zależy od dostępu publicznego do `quiz_results`.
- Brak kompletnego, wersjonowanego RLS/grantów w repozytorium i pełnego audytu alternatywnych ścieżek dostępu do danych.
- Brak serwerowej kontroli czasu odpowiedzi i rate limiting w kodzie endpointów.
- Brak migawki challenge na czas próby; zmiana zestawu lub dnia może zmienić warunki walidacji wyniku.

To lista ograniczeń i przyszłych prac. Nie wdrożono tutaj nowych polityk, sesji ani Auth. Przepływ funkcjonalny opisuje [Daily Quiz](daily-quiz.md).
