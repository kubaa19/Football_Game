# Daily Quiz

## Stan obecny

Stage 5, 2026-09-11. Quiz używa Route Handlers Next.js i serwerowych quiz attempts. Jedyna wspierana ścieżka tworzenia wyniku w kodzie aplikacji to:
Daily Quiz → zapisane odpowiedzi próby → POST /api/quiz/attempt/finish → RPC finish_quiz_attempt → quiz_results z attempt_id.

### Pobranie pytań

`getDailyQuestions()` wywołuje `GET /api/quiz/daily` z `cache: no-store`. Serwer używa `SUPABASE_SECRET_KEY`, wybiera dzisiejszy challenge według UTC i zwraca pytania w kolejności `question_ids`: tylko `id, category, difficulty, question, options, tags`. Nie zwraca `correct_index` ani `explanation`. Frontend nie potrzebuje anonimowego SELECT do questions/daily_challenges.

### Start i wznowienie

`POST /api/quiz/attempt/start` tworzy lub wznawia próbę dla anonimowej tożsamości z HttpOnly cookie. Frontend porównuje identyfikatory i kolejność pytań z daily, sprawdza prefiks zapisanych odpowiedzi i odtwarza pierwsze nierozwiązane pytanie przez `nextQuestionId`.

### Udzielenie odpowiedzi

`QuestionScreen` wysyła `{ attemptId, questionId, selectedIndex }` do `POST /api/quiz/answer`. Timeout 15 s wysyła indeks -1. Handler używa istniejącej tożsamości i RPC `record_quiz_attempt_answer`, które sprawdza właściciela, dzień UTC, przynależność i kolejność pytania oraz utrwala pierwszy wybór przed feedbackiem.

Publiczna odpowiedź to `{ correct, correctIndex, explanation, replayed }`. Timeout daje correct=false. Identyczny retry otwartej, dzisiejszej próby jest sukcesem; próba zmiany wyboru daje konflikt. Przy niepewnym zapisie UI pozwala ponowić tylko ten sam wybór albo zsynchronizować stan. Potwierdzona odpowiedź trafia do stanu przed kliknięciem „Następne”.

### Stan lokalny i podsumowanie

Odpowiedzi serwera są źródłem prawdy. Historyczne klucze `footquiz_completed_*` nie sterują postępem i nie są importowane do prób. `attemptId` nie trafia do localStorage. `footquiz_username` jest wyłącznie opcjonalną preferencją UX.

SummaryScreen obsługuje wyłącznie attempts. `ready_to_finish` udostępnia formularz nicku i finalizację; `completed` wyświetla wynik serwerowy bez formularza i bez „Powtórz”. Kafelki i udostępnianie pozostają dostępne. Refresh podczas feedbacku prowadzi do pierwszego nierozwiązanego pytania.

### Zapis wyniku

`POST /api/quiz/attempt/finish` przyjmuje dokładnie `{ attemptId, username }`. Nick jest wymagany, trimowany i ograniczony do 20 punktów kodowych. Endpoint wymaga zaufanego Origin i istniejącego cookie; nie tworzy ani nie odświeża tożsamości.

Jedynym wywołaniem DB jest `finish_quiz_attempt`. RPC atomowo liczy wynik z utrwalonych odpowiedzi w kolejności challenge, zapisuje quiz_results z attempt_id i ustawia completed_at. Retry zakończonej próby zwraca ten sam wynik. Klient nie przesyła score ani pattern.

Finish zwraca zmapowany wynik i replayed, bez completedAt. Frontend zachowuje potwierdzenie zapisu i synchronizuje pełny stan przez start. Błąd synchronizacji nie przywraca formularza ani nie unieważnia potwierdzonego wyniku. Retry niepewnej finalizacji zachowuje dokładny attemptId i znormalizowany username.

### Historia: wycofanie legacy w Stage 5

Usunięto `/api/quiz/result`, `/quiz/result`, serwerowy i kliencki `saveQuizResult` oraz stary formularz i typy. Po wdrożeniu nowego builda stare adresy nie mają handlerów (oczekiwane 404); nie ma fallbacku ani przekierowania zapisu. Starszy klient musi odświeżyć aplikację. Historyczne testy Stage 3/4 pozostają w [testing.md](../testing.md).

## Znane ograniczenia / planowane zmiany

- Stage 5 zamyka alternatywne zapisy w kodzie aplikacji, nie ustanawia zakazu każdego bezpośredniego INSERT w DB. service_role zachowuje INSERT; finish_quiz_attempt jest SECURITY INVOKER.
- Historyczne quiz_results z attempt_id=NULL pozostają bez zmian; kolumna nadal jest nullable.
- Reset cookie/incognito umożliwia nową tożsamość.
- Timer jest klientowy i resetuje się po refresh nierozwiązanego pytania.
- Start dotyczy dzisiejszego UTC; otwarta próba z poprzedniego dnia wygasa. Brak migawki pytań/zestawu.
- Brak wymuszenia dokładnie pięciu pytań i automatycznej publikacji dziennych zestawów.
- Ranking pozostaje TOP 10; time_taken nie jest zapisywany, streak i rekord strony głównej są placeholderami.
- Rzeczywiste testy dwóch sesji i wymuszonego rollbacku pozostają odłożone.

Szczegóły granicy dostępu: [bezpieczeństwo i dostęp do danych](security-and-data-access.md).
