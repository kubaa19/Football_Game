# Daily Quiz

## 1. Cel i model produktu

FootQuiz używa asynchronicznego „Wyzwania Dnia”:

- jeden challenge na dzień,
- docelowo dokładnie 5 pytań,
- ten sam zestaw dla wszystkich graczy danego dnia,
- dzień liczony w UTC,
- bez trybu 1v1 na żywo,
- bez WebSockets.

Aktualna implementacja opiera się na serwerowym stanie próby (`quiz_attempts`) i nie ufa localStorage jako źródłu prawdy o przebiegu gry.

---

## 2. Pobranie dzisiejszego zestawu

Frontend pobiera pytania przez:

`GET /api/quiz/daily`

Handler:

1. korzysta z serwerowego klienta Supabase,
2. wyznacza bieżącą datę w UTC,
3. pobiera `daily_challenges.question_ids`,
4. wymaga niepustej listy unikalnych ID,
5. pobiera dokładnie wskazane pytania,
6. odtwarza kolejność według `question_ids`,
7. zwraca wyłącznie publiczne pola:
   - `id`,
   - `category`,
   - `difficulty`,
   - `question`,
   - `options`,
   - `tags`.

Endpoint nie zwraca przed odpowiedzią:

- `correct_index`,
- `explanation`.

Odpowiedź ma `Cache-Control: no-store`.

Brak challenge dla dzisiejszej daty zwraca 404. Niespójność danych lub niepełny zestaw powoduje błąd serwera zamiast zwrócenia częściowego quizu.

### Aktualne ograniczenie

Dzienny challenge nie jest jeszcze tworzony automatycznie.

Jeżeli rekord dla bieżącego dnia nie istnieje w `daily_challenges`, użytkownik nie może rozpocząć quizu.

Automatyczne tworzenie/publikowanie dziennego zestawu jest opisane jako najbliższy etap w `ROADMAP.md`.

---

## 3. Anonymous identity

Gra nie wymaga konta.

Anonimowy użytkownik jest identyfikowany przez losowy sekret przechowywany w HttpOnly cookie.

Po stronie serwera:

- sekret jest walidowany,
- do bazy nie trafia surowa wartość cookie,
- używany jest SHA-256 hash anonimowej identity.

W środowisku produkcyjnym cookie używa wariantu `__Host-...` z `Secure`, `HttpOnly`, `SameSite=Lax` i `Path=/`.

W dev używany jest osobny wariant bez `Secure`, aby działał po HTTP.

### Ograniczenie

Wyczyszczenie cookie lub użycie trybu incognito może utworzyć nową anonimową identity.

Jest to zaakceptowane ograniczenie przed wdrożeniem Auth.

---

## 4. Start i resume próby

Frontend rozpoczyna flow przez:

`POST /api/quiz/attempt/start`

Endpoint:

- nie przyjmuje danych biznesowych od klienta,
- tworzy lub wznawia próbę dla anonimowej identity i dzisiejszego challenge,
- korzysta z serwerowego Supabase,
- zwraca autorytatywny stan próby.

Stan może być:

- `in_progress`,
- `ready_to_finish`,
- `completed`.

Odpowiedź zawiera m.in.:

- `attemptId`,
- `challengeId`,
- `challengeDate`,
- `startedAt`,
- `completedAt`,
- `state`,
- `questionIds`,
- zapisane odpowiedzi,
- `nextQuestionId`,
- wynik dla zakończonej próby.

Frontend porównuje `questionIds` z odpowiedzią `GET /api/quiz/daily`.

Przy refreshu nie odtwarza postępu z localStorage. Zapisane odpowiedzi serwera są źródłem prawdy.

---

## 5. Udzielenie odpowiedzi

Odpowiedź jest wysyłana przez:

`POST /api/quiz/answer`

Request:

```json
{
  "attemptId": "<uuid>",
  "questionId": "<uuid>",
  "selectedIndex": 0
}
```

`selectedIndex`:

- `0..3` dla wyboru użytkownika,
- `-1` dla timeoutu.

Endpoint:

1. wymaga istniejącej anonimowej identity,
2. waliduje body,
3. nie tworzy nowego cookie,
4. nie pobiera rozwiązania lokalnie w handlerze,
5. wywołuje RPC `record_quiz_attempt_answer`.

RPC:

- blokuje próbę na czas operacji,
- sprawdza właściciela,
- sprawdza aktualność challenge,
- sprawdza kolejność pytań,
- zapisuje pierwszy zaakceptowany wybór,
- nie pozwala zmienić odpowiedzi,
- oblicza poprawność po stronie DB,
- obsługuje identyczny retry idempotentnie.

Sukces może zwrócić:

```json
{
  "correct": true,
  "correctIndex": 2,
  "explanation": "...",
  "replayed": false
}
```

`correctIndex` i `explanation` są ujawniane dopiero po zaakceptowaniu odpowiedzi.

### Istotne zachowanie

- ten sam wybór wysłany ponownie: sukces z `replayed=true`,
- inny wybór dla już rozwiązanego pytania: konflikt,
- próba zakończona: konflikt,
- próba z poprzedniego dnia: wygasła,
- timeout `-1` zawsze daje `correct=false`.

---

## 6. Timer

UI używa obecnie klientowego timera 15 s.

Timeout wysyła `selectedIndex = -1`.

Timer:

- nie jest autorytatywnym źródłem czasu w rankingu,
- może zresetować się po refreshu nierozwiązanego pytania,
- nie jest obecnie zabezpieczony po stronie serwera.

`time_taken` nie jest zapisywany.

Jeżeli czas ma w przyszłości wpływać na ranking, musi być liczony w sposób server-authoritative albo mechanika czasu powinna zostać pominięta.

---

## 7. Przejście do kolejnego pytania

Po sukcesie `/api/quiz/answer` frontend:

1. zapisuje potwierdzoną odpowiedź w stanie UI,
2. pokazuje feedback,
3. dopiero potem pozwala przejść dalej.

Przycisk „Następne” nie zapisuje odpowiedzi — zapis następuje wcześniej.

`replayed=true` jest traktowane jak zwykły sukces bez podwójnego naliczenia.

---

## 8. Finalizacja quizu

Po zapisaniu wszystkich odpowiedzi próba przechodzi do:

`ready_to_finish`

Frontend pokazuje formularz nicku.

Finalizacja:

`POST /api/quiz/attempt/finish`

Request zawiera dokładnie:

```json
{
  "attemptId": "<uuid>",
  "username": "Kuba"
}
```

Endpoint:

- wymaga istniejącej anonimowej identity,
- nie tworzy ani nie odświeża cookie,
- waliduje username,
- nie przyjmuje score,
- nie przyjmuje `answers_pattern`,
- nie przyjmuje `totalQuestions`,
- wywołuje wyłącznie RPC `finish_quiz_attempt`.

RPC:

- blokuje próbę,
- sprawdza właściciela,
- wymaga kompletnego zestawu odpowiedzi,
- wylicza wynik z zapisanych `is_correct`,
- tworzy `quiz_results`,
- zapisuje `attempt_id`,
- ustawia `completed_at`,
- robi to atomowo w jednej transakcji.

Retry zakończonej próby zwraca istniejący wynik zamiast tworzyć duplikat.

---

## 9. Completed resume

Po potwierdzonym finish frontend ponownie synchronizuje próbę przez `/api/quiz/attempt/start`.

Dla stanu `completed` serwer zwraca zapisany wynik.

Po F5 użytkownik widzi nadal wynik serwerowy.

Nie istnieje już alternatywny legacy flow zapisu wyniku.

Usunięte zostały:

- `/api/quiz/result`,
- `/quiz/result`,
- `saveQuizResult`,
- legacy frontend save flow.

---

## 10. Ranking po ukończeniu quizu

Ranking jest pobierany przez:

`GET /api/quiz/leaderboard`

Frontend nie wykonuje bezpośredniego SELECT na `quiz_results`.

Endpoint:

- używa serwerowego klienta Supabase,
- filtruje po bieżącej dacie UTC,
- obecnie zwraca TOP 10,
- wystawia wyłącznie:
  - `id`,
  - `username`,
  - `score`,
  - `totalQuestions`.

Historyczne wyniki bez `attempt_id` mogą nadal pojawiać się w rankingu.

Docelowy ranking MVP: TOP 50.

---

## 11. LocalStorage

LocalStorage nie jest źródłem prawdy dla:

- przebiegu próby,
- ukończenia,
- odpowiedzi,
- wyniku.

`footquiz_username` może być nadal używany jako preferencja UX.

Stan gry pochodzi z serwera.

---

## 12. Znane ograniczenia

- brak automatycznego generowania/publikowania `daily_challenges`,
- API nie wymusza jeszcze docelowej liczby dokładnie 5 pytań we wszystkich warstwach,
- timer jest klientowy,
- `time_taken` nie jest zapisywany,
- dzień liczony jest w UTC,
- reset cookie/incognito tworzy nową anonimową identity,
- opublikowany challenge i użyte pytania nie są jeszcze objęte pełną polityką immutability,
- rzeczywista współbieżność dwóch niezależnych sesji DB pozostaje testem odłożonym,
- forced failure pomiędzy INSERT wyniku a `completed_at` nie został jeszcze przetestowany w realnym Postgresie.

---

## 13. Następne etapy

Najbliższe prace są śledzone w:

`ROADMAP.md`

W szczególności:

1. automatyczne Daily Challenge,
2. Analytics MVP,
3. decyzja o rankingu i czasie,
4. security hardening,
5. content readiness,
6. share/virality,
7. soft-launch.

Auth i pełny streak nie są wymagane do pierwszego kontrolowanego testu użytkowników.
