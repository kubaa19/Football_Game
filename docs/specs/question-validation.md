# Pipeline jakości pytań

## Zakres i aktualna decyzja

Generator → walidacja techniczna → ręczna kontrola merytoryczna → import do Supabase.

- Generator: `src/scripts/question-generator.txt`.
- Implementacja Etapu 1: `src/scripts/prompts/validate-questions.js`.
- Ten dokument: `docs/specs/question-validation.md`.

**Przejście walidacji technicznej NIE potwierdza prawdziwości pytania ani poprawności correct_index.** Na MVP po kontroli technicznej człowiek weryfikuje pytanie, wszystkie opcje, wskazany indeks i wyjaśnienie. Przed importem trzeba rozstrzygnąć ostrzeżenia o podobieństwie i usunąć błędy zestawu. Walidator sam nie importuje danych.

## Etap 1 — walidacja techniczna (wdrożone)

Czysty lokalny JavaScript, bez dodatkowych zależności i bez dostępu do internetu. Funkcja `validateQuestions(input, options?)` jest dostępna także przez eksport CommonJS `{ validateQuestions }`.

### Format wyniku

```js
{
  validQuestions: [],
  invalidQuestions: [
    // { index, question: oryginalnaWartosc, reasons: [...] }
  ],
  warnings: [],
  errors: [],
  summary: { total: 0, valid: 0, invalid: 0 }
}
```

- `validQuestions`: oryginalne obiekty bez błędów technicznych.
- `invalidQuestions`: oryginalna wartość, jej indeks w wejściu i wszystkie wykryte `reasons`.
- `warnings`: ostrzeżenia dotyczące par podobnych pytań; nie zmieniają klasyfikacji valid/invalid.
- `errors`: błędy całego wejścia lub oczekiwanej liczebności zestawu.
- `summary`: liczba elementów wejścia, poprawnych i niepoprawnych. Dla wejścia innego niż tablica wszystkie liczniki wynoszą zero.

Indeksy liczone są od zera. `validQuestions` nie oznacza zatwierdzenia całego zestawu: `errors` może być niepuste mimo poprawności poszczególnych pytań.

### Reguły

| Element | Warunek |
|---|---|
| Wejście | Tablica; inaczej `INPUT_NOT_ARRAY` i zwrot raportu. |
| Pytanie | Zwykły obiekt z prototypem `Object.prototype` lub `null`; tablice, `null`, daty i instancje innych klas są odrzucane. |
| Pola | Dokładnie własne pola `category`, `difficulty`, `question`, `options`, `correct_index`, `explanation`, `tags`. Brakujące i dodatkowe klucze są raportowane osobno; sprawdzane są też własne klucze symboliczne i nieenumerowalne. |
| `category` | Dokładnie `transfers`, `records`, `champions_league`, `world_cup` albo `tactics_and_rules`. |
| `difficulty` | Liczba całkowita 1–3. |
| `question` | String niepusty po `trim()`. |
| `options` | Tablica dokładnie czterech stringów, każdy niepusty po `trim()`. |
| Unikalność opcji | Porównanie `trim().toLowerCase()`; duplikat wskazuje indeks pierwszej pasującej opcji. |
| `correct_index` | Liczba całkowita 0–3. |
| `explanation` | String niepusty po `trim()`. |
| `tags` | Tablica co najmniej jednego stringa; każdy niepusty po `trim()`. |

Nie ma konwersji stringów na liczby. Nie ma limitów długości tekstów ani sprawdzania unikalności tagów. Język, faktyczna trudność i semantyczna poprawność kategorii nie są sprawdzane.

### Diagnostyka i brak mutowania

Reason ma format:

```js
{
  code: 'OPTION_DUPLICATE',
  path: 'options[3]',
  message: 'Duplicate option after trim and lowercase.',
  relatedIndex: 1
}
```

`relatedIndex` jest opcjonalne. Dla opcji wskazuje indeks opcji; dla duplikatów pytań — indeks pytania w zestawie. Ścieżka `$` oznacza całą sprawdzaną wartość. Komunikaty obecnej implementacji są po angielsku.

Walidator zbiera wszystkie możliwe do sprawdzenia problemy. Przy nieprawidłowym typie obiektu lub tablicy nie próbuje wykonywać zależnych operacji na jej elementach. Brak pola może dać jednocześnie `FIELD_MISSING` i błąd wartości danego pola.

Kody diagnostyczne obejmują: `QUESTION_NOT_OBJECT`, `FIELD_MISSING`, `FIELD_UNEXPECTED`, `CATEGORY_INVALID`, `DIFFICULTY_INVALID`, `QUESTION_TEXT_INVALID`, `OPTIONS_NOT_ARRAY`, `OPTIONS_COUNT`, `OPTION_INVALID`, `OPTION_DUPLICATE`, `CORRECT_INDEX_INVALID`, `EXPLANATION_INVALID`, `TAGS_NOT_ARRAY`, `TAGS_EMPTY`, `TAG_INVALID`, `QUESTION_DUPLICATE`.

Dane wejściowe nie są zmieniane. Normalizacja służy wyłącznie porównaniom. Raport zachowuje referencje do oryginalnych obiektów, nie tworzy ich głębokich kopii. Typowe błędne dane, np. `null`, `{}`, `[null]`, liczby w opcjach i `null` w tagach, dają diagnostykę zamiast wyjątku. Nie jest to zabezpieczenie przed obiektami z rzucającymi wyjątki getterami lub Proxy; podstawowym wejściem są dane z JSON.

### expectedCount

```js
validateQuestions(input, { expectedCount: 5 });
```

Opcja jest dobrowolna. Musi być nieujemną liczbą całkowitą, inaczej dodawany jest `EXPECTED_COUNT_INVALID`. Niezgodna liczba elementów daje `COUNT_MISMATCH`. W obu przypadkach walidacja wszystkich elementów nadal trwa. Bez tej opcji pusta tablica jest poprawnym technicznie pustym zestawem.

### Dokładne duplikaty pytań

Tekst `question` jest porównywany po `trim().toLowerCase()`. Wszystkie elementy grupy powtórzeń trafiają do `invalidQuestions`. Każdy dostaje osobny reason `QUESTION_DUPLICATE` dla każdego pozostałego indeksu grupy.

Nie normalizuje się tutaj wewnętrznych odstępów ani interpunkcji. Sprawdzane są również teksty pytań mających inne błędy techniczne, jeśli sam tekst jest niepustym stringiem.

### Podobieństwo Jaccarda

Dla każdej pary pytań z poprawnym typem tekstu:

1. Tekst jest zamieniany na lowercase.
2. Znaki inne niż litery Unicode, liczby Unicode i białe znaki są zastępowane spacją.
3. Tekst jest dzielony według białych znaków na zbiór unikalnych słów; liczby zostają zachowane.
4. Podobieństwo wynosi `liczba wspólnych słów / liczba słów w sumie zbiorów`.

Wynik `>= 0.85` tworzy warning:

```js
{
  code: 'QUESTION_SIMILAR',
  indexes: [0, 4],
  similarity: 0.88,
  message: 'Questions may test the same fact.'
}
```

Wartość similarity w przykładzie jest ilustracyjna. Kod zapisuje rzeczywisty iloraz bez zaokrąglania. Dokładne duplikaty są pomijane w tym etapie, podobnie jak pary z pustą sumą zbiorów słów. Ostrzeżenie nie odrzuca pytań automatycznie. Metoda nie wykrywa niezawodnie parafraz i może ostrzegać o pytaniach dotyczących różnych lat. Porównanie par ma koszt kwadratowy względem liczby pytań.

### Weryfikacja implementacji

Lokalne testy wykonane przy wdrożeniu zakończyły się wynikiem **21/21 PASS**. Obejmowały prawidłowe pytanie, brak i nadmiar pól, błędną kategorię i trudność, duplikaty opcji po normalizacji, liczby i null w opcjach, nieprawidłowy indeks, puste tagi i null w tagach, dokładne duplikaty, ostrzeżenia podobieństwa, nieprawidłowe typy wejścia, expectedCount, brak mutacji oraz zbieranie wielu reasons.

To wynik lokalnego skryptu testowego z etapu implementacji, a nie deklaracja istniejącego zestawu testów CI. Testy techniczne nie potwierdzają faktów piłkarskich.

## Etap 2 — factual validation (planowane)

**Decyzja projektowa: NIE wdrażamy tego obecnie. Na MVP stosujemy ręczną kontrolę merytoryczną.** Do automatyzacji wrócimy, gdy skala generowania pytań sprawi, że ręczna kontrola stanie się wąskim gardłem.

Plan przyszłego etapu:

1. Niezależnie ustalić poprawną odpowiedź na podstawie pytania i opcji, bez wcześniejszego ujawniania weryfikatorowi `correct_index` i `explanation`.
2. Zweryfikować fakt na wiarygodnych źródłach, preferując oficjalne wyniki, organizatorów rozgrywek i archiwa. Zachować dowody i adresy źródeł. Brak dowodu nie jest dowodem fałszu.
3. Ocenić wszystkie cztery opcje i potwierdzić, że dokładnie jedna jest poprawna. Sprawdzić zakres czasowy, zamknięty charakter faktu oraz jednoznaczność pytania.
4. Porównać niezależnie ustalony `verifiedCorrectIndex` z zadeklarowanym `correct_index`.
5. Osobno sprawdzić `explanation`, w tym dodatkowe daty, liczby i twierdzenia.
6. Wykrywać semantyczne duplikaty: różnie sformułowane pytania sprawdzające ten sam fakt.

Planowane statusy raportu:

- `verified`: wystarczające dowody, jedna poprawna opcja, zgodny indeks i wyjaśnienie.
- `rejected`: potwierdzona sprzeczność lub wada pytania.
- `needs_review`: niewystarczające lub sprzeczne źródła albo niejednoznaczność.

Raport i źródła pozostaną osobnymi metadanymi, poza siedmioma polami pytania. Nie będzie automatycznego poprawiania błędnego `correct_index`. Weryfikator może zaproponować korektę, ale poprawione pytanie musi ponownie przejść oba etapy. Obecnie oznacza to walidację techniczną i ponowną ręczną kontrolę; po wdrożeniu automatyzacji — Etap 1 i Etap 2.

## Integracja z adminem, importem i schematem SQL

Walidator nie jest automatycznie podłączony do panelu admina ani ścieżki importu. Jego uruchomienie jest osobnym krokiem procesu. Przejście walidacji nie oznacza automatycznego dopuszczenia pytania do bazy; nadal wymagana jest ręczna kontrola merytoryczna i rozstrzygnięcie diagnostyki zestawu.

`supabase/schema.sql` nie wymusza wszystkich reguł `validate-questions.js`: nie zapewnia dokładnie czterech unikalnych opcji, dozwolonej kategorii, niepustych tekstów i tagów ani braku duplikatów pytań. Część pól dopuszcza NULL. Walidacja lokalna i ograniczenia SQL nie są równoważne.
