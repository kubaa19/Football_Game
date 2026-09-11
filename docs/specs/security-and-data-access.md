# Bezpieczeństwo i dostęp do danych

## Stan obecny i granica zaufania

Stage 5, 2026-09-11. Dane klienta i localStorage nie są źródłem prawdy dla wyniku. Aktualna aplikacja tworzy quiz_results wyłącznie przez endpoint finish i RPC finish_quiz_attempt.

`src/lib/supabase.ts` korzysta z publicznych NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY. Ranking nadal odczytuje quiz_results bezpośrednio, a admin zapisuje pytania do questions. Stage 5 nie zmienia tych funkcji ani uprawnień DB.

Serwerowy helper `supabaseAdmin.ts` ma import server-only i używa SUPABASE_SECRET_KEY bez sesji użytkownika. Tożsamość próby pochodzi z HttpOnly cookie; tylko start może ją utworzyć. Answer i finish odczytują istniejącą tożsamość, a owner hash wyliczają wyłącznie na serwerze. Origin jest sprawdzany względem konfiguracji, nie dowolnego Host. Sam attemptId nie jest dowodem własności.

## Ochrona odpowiedzi

GET /api/quiz/daily zwraca tylko publiczne pola pytania, bez correct_index i explanation. Quiz nie wymaga anonimowego SELECT do questions/daily_challenges.

POST /api/quiz/answer wywołuje record_quiz_attempt_answer: RPC sprawdza właściciela, aktualny challenge i kolejność, zapisuje pierwszy wybór, a następnie zwraca feedback. Identyczny retry jest bezpieczny dla otwartej dzisiejszej próby; inny wybór jest konfliktem. Timeout -1 nie jest poprawną odpowiedzią.

To opis ochrony ścieżki aplikacji, a nie potwierdzenie bezpieczeństwa wszystkich zdalnych grantów, widoków i funkcji.

## Serwerowe przeliczanie wyniku

Jedyna wspierana ścieżka aplikacji:
`POST /api/quiz/attempt/finish → finish_quiz_attempt → quiz_results(attempt_id)`.

Request zawiera wyłącznie attemptId i username. RPC oblicza score, total_questions i answers_pattern z zapisanych odpowiedzi, atomowo zapisuje wynik i completed_at. Zakończona próba zwraca istniejący wynik przy retry. Frontend pokazuje wynik serwera i synchronizuje completed przez start.

**Historia Stage 5:** usunięto legacy /api/quiz/result, /quiz/result i saveQuizResult, które przyjmowały listę wyborów od klienta i wykonywały INSERT bez attempt_id. Usunięto też odpowiadającą im gałąź SummaryScreen i typy. Nie ma aplikacyjnego fallbacku.

## Auth i stan RLS wynikający z repozytorium

Auth Google/Email i kontrola roli admina nie są wdrożone. Nick nie stanowi potwierdzonej tożsamości.

Pierwotny schema.sql definiuje questions, daily_challenges i quiz_results. Migracja 20260910120000_quiz_attempts.sql dodaje quiz_attempts, quiz_attempt_answers, nullable FK/UNIQUE quiz_results.attempt_id oraz RPC. Nowe tabele prób mają RLS i odebrane uprawnienia anon/authenticated; RPC przeznaczono dla service_role.

**Granica Stage 5:** service_role nadal ma SELECT i INSERT do quiz_results; finish_quiz_attempt działa jako SECURITY INVOKER i potrzebuje uprawnień wywołującej roli. Usunięcie endpointów nie odbiera tych grantów. Nie można twierdzić, że baza technicznie uniemożliwia wszystkie bezpośrednie INSERT-y. Odebranie INSERT bez innego modelu uprawnień funkcji zepsułoby finish.

Historyczne wyniki z attempt_id=NULL pozostają nienaruszone. Nullable, FK i UNIQUE nie zostały zmienione. Nowy kod aplikacji nie tworzy wyników bez attempt_id, ale DB nadal dopuszcza je dla uprawnionych zapisujących.

**Nie wykonano audytu zdalnych polityk ani migracji w Stage 5.** Repo nie zawiera kompletnej konfiguracji RLS/grantów dla wszystkich tabel. DB-level hardening wymaga osobnego etapu.

## Znane luki / TODO

- Bezpośredni zapis przy użyciu uprawnionej roli pozostaje możliwy; publicznych zdalnych uprawnień quiz_results nie potwierdzono.
- Reset cookie/incognito pozwala utworzyć nową identity; brak Auth i potwierdzenia właściciela nicku.
- Admin nie ma kontroli roli; ranking nadal czyta Supabase bezpośrednio.
- Brak serwerowego timera, rate limiting i migawki challenge/questions. Refresh resetuje timer nierozwiązanego pytania; granica UTC może wygasić otwartą próbę.
- Rzeczywista współbieżność dwóch sesji i forced rollback pomiędzy INSERT wyniku a completed_at pozostają do testów w izolowanym środowisku.
- Historyczne wyniki bez attempt_id nie mają powiązania z utrwalonymi odpowiedziami.

Przepływ funkcjonalny: [Daily Quiz](daily-quiz.md). Historia testów: [testing.md](../testing.md).
