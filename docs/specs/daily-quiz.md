# Daily Quiz

## Stan obecny

Opis implementacji na 2026-09-10. Quiz używa Route Handlers Next.js, nie Server Actions. Nie istnieje serwerowa tabela ani mechanizm `quiz_attempts`.

### Pobranie pytań

`getDailyQuestions()` w `src/services/quizService.ts` wywołuje `GET /api/quiz/daily` z `cache: no-store`. Nie wykonuje anonimowego SELECT do `questions` ani `daily_challenges`.

Handler w `src/app/api/quiz/daily/route.ts`:

1. Używa `NEXT_PUBLIC_SUPABASE_URL` i serwerowego `SUPABASE_SECRET_KEY`.
2. Wyznacza datę UTC przez `new Date().toISOString().split('T')[0]`.
3. Pobiera dzisiejszy `daily_challenges.question_ids`.
4. Wymaga niepustej listy unikalnych ID i pełnego zestawu istniejących pytań.
5. Odtwarza kolejność według `question_ids`, niezależnie od kolejności rekordów zwróconych przez bazę.
6. Zwraca tablicę zawierającą tylko `id`, `category`, `difficulty`, `question`, `options`, `tags`.

GET nie zwraca `correct_index` ani `explanation`. Odpowiedź ma `Cache-Control: no-store`; handler jest `force-dynamic`. Brak wyzwania daje 404, błędy konfiguracji/bazy lub niekompletny zestaw — 500. Klient zamienia błąd pobrania na `null`, a ekran quizu pokazuje komunikat błędu.

### Udzielenie odpowiedzi

`QuestionScreen` ma domyślny timer 15 s. Kliknięcie wysyła `POST /api/quiz/answer` z `{ questionId, selectedIndex }`; timeout wysyła `selectedIndex: -1`. Podczas sprawdzania przyciski są zablokowane.

Handler sprawdza UUID i całkowity indeks -1..3. Przed odczytem rozwiązania sprawdza przynależność pytania do dzisiejszego challenge w UTC. Obce ID daje 403 bez rozwiązania. Brak wyzwania/pytania daje 404; błędne wejście 400, problemy danych lub serwera 500.

Serwer pobiera `correct_index` i `explanation`, sprawdza indeks z bazy jako integer 0..3 i zwraca:

```js
{ correct: boolean, correctIndex: number, explanation: string }
```

Timeout zawsze daje `correct: false`. Brak wyjaśnienia w bazie jest zamieniany na pusty tekst. UI dopiero po odpowiedzi API ustawia podświetlenie i pokazuje wyjaśnienie. Następnie przekazuje poprawność i wybrany indeks do kontenera quizu.

### Stan lokalny i podsumowanie

`src/app/quiz/page.tsx` zachowuje osobno tablicę poprawności `answers` oraz wybory `submittedAnswers: [{ questionId, selectedIndex }]`.

Po ukończeniu zapisuje w `localStorage` pod kluczem `footquiz_completed_YYYY-MM-DD`: lokalny `score`, `totalQuestions`, `answers`, `submittedAnswers`, `completedAt`. Nick przechowuje pod `footquiz_username`. Klucz daty jest oparty na UTC po stronie klienta.

Po ponownym wejściu odtwarza ukończone podsumowanie. Stary zapis bez `submittedAnswers` albo bez poprawnych indeksów nie jest traktowany jako kompletna próba do API. Historyczna tablica `answers` nadal służy do wyświetlenia kafelków i wyniku. Formularz zapisu jest zastępowany informacją o braku kompletu wyborów. Podsumowanie nadal zależy od pobrania dzisiejszych pytań.

Przycisk „Powtórz” resetuje bieżącą grę i pozwala rozegrać zestaw ponownie. `alreadyCompleted` jest przekazywane do podsumowania, ale nie stanowi serwerowej blokady.

Podsumowanie i udostępniany tekst korzystają z lokalnego wyniku. Odpowiedź serwera po zapisie nie zastępuje tych wartości. Web Share lub schowek udostępnia wynik i kafelki bez czasu, numeru wyzwania i UTM.

### Zapis wyniku

Obie trasy `POST /api/quiz/result` i `POST /quiz/result` eksportują tę samą funkcję `saveQuizResult` z `src/server/saveQuizResult.ts`, oznaczonego `server-only`. Nie ma dwóch implementacji walidacji.

Klient wysyła wyłącznie:

```js
{ username: string, answers: [{ questionId: string, selectedIndex: number }] }
```

Handler:

- Odrzuca dodatkowe pola, w tym dawny kontrakt `score`, `total_questions`, `answers_pattern`.
- Waliduje nick po trim: 1–20 znaków.
- Sprawdza UUID, indeks integer -1..3, duplikaty ID po lowercase i pełną zgodność odpowiedzi z dzisiejszym zestawem.
- Pobiera poprawne indeksy z bazy i sprawdza ich zakres 0..3.
- Odtwarza kolejność z `question_ids`; kolejność przesłanej tablicy nie wpływa na wzór.
- Wylicza `score`, `answers_pattern` z bitów 1/0 i `total_questions` z długości challenge. Timeout daje 0.
- Zapisuje nick i te wartości do `quiz_results` wraz z `played_at` wyznaczonym raz dla żądania w UTC.

Nie zapisuje `time_taken`, `user_id`, `challenge_id` ani historii wyborów. Zwraca `{ success: true, result }`. Błędne żądania są odrzucane przed zapisem; UI pokazuje błąd zapisu i odblokowuje formularz.

## Znane ograniczenia / planowane zmiany

- Pięć pytań jest celem produktu; kod obsługuje długość challenge i nie wymusza dokładnie pięciu.
- Brak automatycznego generowania/publikowania dziennego zestawu.
- Brak serwerowej próby, zapamiętywania pierwszych odpowiedzi i ochrony przed ponownym zapisem. Serwer przelicza przesłane wybory, ale nie potwierdza ich historii.
- Timer jest lokalny; serwer nie mierzy czasu ani nie wymusza timeoutu.
- Zmiana dnia UTC lub zestawu w trakcie gry może unieważnić zapis. Zestaw nie ma wersji ani migawki na czas próby.
- Strona główna wyświetla datę lokalną przeglądarki, a quiz używa UTC. Komunikat „jutro o 00:00” nie precyzuje strefy.
- Lokalne podsumowanie może różnić się od wyniku przeliczonego przy zapisie; stare podsumowania wymagają dostępnego dzisiejszego zestawu.
- Ranking to TOP 10, mimo celu TOP 50; czas nie jest zapisywany. Streak i rekord strony głównej są placeholderami.

Sesje/próby, Auth i rozszerzona ochrona są przyszłymi zadaniami, nie istniejącą architekturą. Szczegóły: [bezpieczeństwo i dostęp do danych](security-and-data-access.md).
