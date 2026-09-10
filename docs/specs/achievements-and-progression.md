# FootQuiz — Achievements & Progression

Status: plan na najbliższe iteracje  
Cel: zwiększenie Day 1 / Day 7 retention przy możliwie małym koszcie implementacji.

---

## 1. Założenia

System progresji ma być początkowo mały i bezpośrednio wspierać główną pętlę FootQuiz:

`wejdź → zagraj Daily → zobacz progres → miej powód, żeby wrócić jutro`

Nie planujemy teraz kompletnego systemu gamifikacji na wiele miesięcy do przodu. Każdy mechanizm powinien mieć jasny wpływ na zaangażowanie i być możliwy do wdrożenia w najbliższych tygodniach.

Nie wchodzą obecnie do zakresu m.in. monety, sklep, battle pass, lootboxy, rozbudowane misje, kosmetyki, rzadkość odznak czy osiągnięcia ligowe.

---

# ITERACJA 1 — Daily Quiz

Celem pierwszej iteracji jest zbudowanie najprostszej możliwej pętli retencyjnej wokół istniejącego Wyzwania Dnia.

## 2. Mechanizm 1 — Daily Streak

Gracz otrzymuje serię za ukończenie Wyzwania Dnia w kolejnych dniach.

Przykład:

```text
🔥 Seria: 6 dni

Zagraj jutro, aby osiągnąć serię 7 dni.
```

### Progi pierwszej wersji

- 3 dni — „Rozgrzewka”
- 7 dni — „Tydzień w formie”
- 14 dni — „Żelazna seria”
- 30 dni — „Miesiąc bez przerwy”

Na tym etapie nie projektujemy progów 100/365 dni.

### Zasady

- streak rośnie maksymalnie raz dziennie,
- replay Daily nie zwiększa streaka,
- ukończenie kilku prób tego samego dnia nie daje dodatkowego progresu,
- opuszczenie dnia resetuje bieżący streak,
- najlepszy historyczny streak można przechowywać od początku, nawet jeśli UI jeszcze go nie wykorzystuje,
- logika streaka musi być liczona po stronie serwera.

Dokładna strefa czasowa i granica dnia powinny być spójne z mechanizmem Daily Quiz.

---

## 3. Mechanizm 2 — podstawowe odznaki

Pierwsza wersja ma zawierać małą liczbę osiągnięć związanych wyłącznie z zachowaniami, które chcemy wzmacniać.

### Streak

| Odznaka | Warunek |
|---|---|
| 🔥 Rozgrzewka | streak 3 dni |
| 🔥 Tydzień w formie | streak 7 dni |
| 🔥 Żelazna seria | streak 14 dni |
| 🔥 Miesiąc bez przerwy | streak 30 dni |

### Perfekcyjne Daily

| Odznaka | Warunek |
|---|---|
| 🎯 Bez pudła | pierwsze 5/5 |
| 🎯 Snajper | 5 wyników 5/5 |

### Regularność

| Odznaka | Warunek |
|---|---|
| ⚽ Pierwszy gwizdek | ukończenie pierwszego oficjalnego Daily |
| 🏆 Stały bywalec | ukończenie 10 Daily |
| 🏆 Weteran | ukończenie 30 Daily |

Pierwsza wersja zawiera więc tylko około 9 odznak.

Nie tworzymy jeszcze osiągnięć dla kategorii pytań, lig, poziomów trudności ani osiągnięć sekretnych.

### Zasady

- odznaka jest przyznawana tylko raz,
- zdobytej odznaki nie można utracić,
- progres liczą tylko oficjalne próby,
- replay nie zwiększa statystyk ani progresu,
- warunki osiągnięć są sprawdzane po stronie serwera.

---

## 4. Mechanizm 3 — „Następny cel”

System powinien pokazywać graczowi jeden konkretny cel, do którego jest obecnie najbliżej.

Przykład na stronie głównej:

```text
🎯 Następny cel

🔥 Tydzień w formie

Ukończ jeszcze 2 Wyzwania Dnia z rzędu.

5 / 7
```

Przykład po zakończeniu Daily:

```text
🔥 Seria
5 → 6 dni

Jeszcze 1 dzień do odznaki
„Tydzień w formie”.
```

### Priorytet wyboru celu

W pierwszej wersji nie jest potrzebny skomplikowany algorytm.

System może preferować:

1. najbliższy niezdobyty próg streaka,
2. najbliższą odznakę za liczbę rozegranych Daily,
3. najbliższą odznakę za perfekcyjne wyniki.

Najważniejsze jest, aby cel był:
- zrozumiały,
- osiągalny,
- powiązany z kolejnym wejściem do aplikacji.

---

## 5. Mechanizm 4 — widoczny progres

Odznaki nie powinny działać wyłącznie jako stan `zdobyta / niezdobyta`.

Jeśli osiągnięcie ma liczbowy próg, pokazujemy progres.

Przykłady:

```text
🔥 Tydzień w formie
5 / 7
```

```text
🎯 Snajper
3 / 5 perfekcyjnych Daily
```

```text
🏆 Stały bywalec
8 / 10 rozegranych Daily
```

Progres powinien być widoczny przede wszystkim:
- przy „Następnym celu”,
- na prostym ekranie/listingu osiągnięć,
- po zakończeniu Daily, jeśli gracz wyraźnie zbliżył się do celu.

Nie ma potrzeby pokazywania wszystkich liczników wszędzie.

---

## 6. Mechanizm 5 — moment zdobycia odznaki

Zdobycie osiągnięcia musi być zauważalne.

Po zakończeniu Daily, jeśli gracz odblokował odznakę:

```text
🏆 NOWA ODZNAKA

🔥 Tydzień w formie

7 dni z rzędu!
```

Po komunikacie można od razu pokazać kolejny cel:

```text
Następny cel:
🔥 Żelazna seria

7 / 14
```

### UX

Nie tworzymy rozbudowanego systemu animacji.

Pierwsza wersja może używać:
- prostego modala,
- karty na ekranie wyników,
- lekkiej animacji wejścia.

Jeżeli jednocześnie zdobyto kilka osiągnięć, UI powinien prezentować je w jednej spójnej sekcji zamiast wyświetlać serię osobnych popupów.

---

## 7. Pętla Iteracji 1

Docelowe zachowanie po ukończeniu Daily:

```text
Daily Quiz
    ↓
wynik
    ↓
aktualizacja streaka
    ↓
aktualizacja progresu osiągnięć
    ↓
ewentualna nowa odznaka
    ↓
następny cel
    ↓
powód do powrotu jutro
```

To jest cały zakres pierwszej iteracji gamifikacji.

---

## 8. Minimalne wymagania techniczne Iteracji 1

Implementacja wymaga wiarygodnej identyfikacji gracza i oficjalnej próby Daily.

Serwer musi móc ustalić co najmniej:

- ile oficjalnych Daily ukończył użytkownik,
- aktualny streak,
- najlepszy streak,
- ile razy zdobył 5/5,
- jakie odznaki już zdobył.

Nie należy naliczać osiągnięć na podstawie danych przesłanych przez klienta.

Ponowne wysłanie tego samego requestu nie może:
- zwiększyć streaka,
- zwiększyć licznika Daily,
- zwiększyć licznika 5/5,
- przyznać ponownie odznaki.

Mechanizm musi być idempotentny.

---

# ITERACJA 2 — XP + Typer Dnia

Druga iteracja jest planowana dopiero po uruchomieniu i sprawdzeniu podstawowej progresji Daily.

Obejmuje dwa rozszerzenia:
1. XP i poziom profilu,
2. najskuteczniejsze mechanizmy progresji Typera Dnia.

---

## 9. XP i poziom gracza

XP ma dawać długoterminowe poczucie rozwoju konta.

Nie powinno być skomplikowaną walutą ani wpływać na uczciwość Daily.

### Proponowany prosty model

| Akcja | XP |
|---|---:|
| Ukończenie Daily | +20 |
| Poprawna odpowiedź | +5 |
| Wynik 5/5 | +15 bonus |
| Poprawny typ | +25 |

Wartości są robocze i powinny zostać dostrojone przed implementacją.

Przykład dla 5/5:

```text
Ukończenie: +20 XP
5 poprawnych: +25 XP
Bonus 5/5: +15 XP

Razem: +60 XP
```

### Poziom

XP może przekładać się na prosty poziom profilu:

```text
Poziom 12
1 840 / 2 000 XP
```

Na początku level nie musi niczego odblokowywać.

Jego rolą jest:
- pokazanie długoterminowego progresu,
- nadanie wartości aktywności,
- przygotowanie fundamentu pod przyszłe funkcje.

Nie projektujemy jeszcze rozbudowanej tabeli 50+ poziomów ani nagród za każdy level.

---

# 10. Typer Dnia — założenie

Typer Dnia tworzy drugą pętlę retencyjną:

```text
oddaj typ
    ↓
mecz zostaje rozegrany
    ↓
wróć po wynik
    ↓
zobacz progres
    ↓
oddaj kolejny typ
```

Pierwsza wersja osiągnięć Typera powinna być równie mała jak system Daily.

---

## 11. Typer — „Ekspert typowania”

Główna długoterminowa ścieżka Typera.

Liczy poprawnie przewidziane wyniki 1/X/2.

### Progi

| Odznaka | Warunek |
|---|---:|
| 🔮 Pierwsze trafienie | 1 poprawny typ |
| 🔮 Dobry typer | 5 poprawnych typów |
| 🔮 Ekspert typowania | 10 poprawnych typów |
| 🔮 Mistrz typowania | 25 poprawnych typów |

Przykład progresu:

```text
🔮 Ekspert typowania

7 / 10 poprawnych typów
```

Po trafieniu:

```text
TRAFIONY! ✅

Ekspert typowania
7 → 8 / 10
```

Nie tworzymy jeszcze osiągnięć za skuteczność procentową, konkretne ligi, remisy czy Hity Kolejki.

---

## 12. Typer — seria trafionych typów

Drugi mechanizm Typera wykorzystuje aktualną serię poprawnych przewidywań.

### Progi

| Odznaka | Warunek |
|---|---:|
| 🔥 Gorąca ręka | 3 trafione typy z rzędu |
| 🔥 Wizjoner | 5 trafionych typów z rzędu |
| 🔥 Prorok futbolu | 7 trafionych typów z rzędu |

Przykład:

```text
🔥 Wizjoner

4 / 5 trafionych typów z rzędu
```

Nietrafiony typ resetuje aktualny licznik serii do 0.

Zdobyte wcześniej odznaki pozostają na koncie.

---

## 13. Odbiór wyniku Typera

Po powrocie gracza po rozliczeniu meczu aplikacja powinna pokazać wynik w sposób podobny do podsumowania Daily.

Przykład:

```text
🔮 Wczorajszy typ

Arsenal — Liverpool
Twój typ: 1

TRAFIONY! ✅

+25 XP

Ekspert typowania
9 → 10 / 10

🏆 NOWA ODZNAKA
Ekspert typowania
```

Przy nietrafionym typie:

```text
NIETRAFIONY ❌

Seria trafień została przerwana.

Dzisiejszy typ już czeka.
```

Komunikacja nie powinna używać języka hazardowego typu „odegraj się”, „stawka”, „wygrana pieniężna” itp.

---

## 14. Zakres Iteracji 2

Do Iteracji 2 wchodzą wyłącznie:

- XP,
- prosty level profilu,
- XP za Daily,
- XP za poprawny typ,
- ścieżka „Ekspert typowania”,
- seria poprawnych typów,
- progres osiągnięć Typera,
- komunikat o zdobyciu odznaki po rozliczeniu typu.

Nie wchodzą jeszcze:

- osobny streak uczestnictwa w Typerze,
- badge za remisy,
- badge za konkretne ligi,
- skuteczność procentowa jako achievement,
- osiągnięcia „Hit Kolejki”,
- osiągnięcia łączące Quiz + Typer,
- sekretne achievementy,
- kosmetyczne nagrody,
- monety i sklep.

Te pomysły mogą wrócić dopiero po sprawdzeniu danych z dwóch pierwszych iteracji.

---

## 15. Jak ocenić, czy system działa

Po wdrożeniu Iteracji 1 należy przede wszystkim sprawdzić:

- czy użytkownicy ze streakiem częściej wracają następnego dnia,
- ilu użytkowników dochodzi do 3- i 7-dniowego streaka,
- ilu graczy zdobywa pierwszą odznakę,
- czy gracze blisko kolejnego celu częściej wracają,
- czy ekran/progres osiągnięć jest faktycznie oglądany.

Po Iteracji 2 dodatkowo:

- ilu graczy wraca po wynik Typera,
- czy progres „Eksperta typowania” zwiększa regularność typowania,
- czy seria trafień zwiększa liczbę kolejnych wizyt,
- czy XP/level daje mierzalny wzrost retencji.

Jeżeli mechanizm nie daje zauważalnego efektu, nie rozbudowujemy go tylko dlatego, że był wcześniej zaplanowany.

---

## 16. Podsumowanie roadmapy

### Iteracja 1 — najbliższy cel

**Daily Streak + mały system achievementów**

1. Daily Streak.
2. Około 9 podstawowych odznak.
3. Jeden „Następny cel”.
4. Widoczny progres.
5. Wyraźny moment zdobycia odznaki.

Pętla:

`Daily → streak → progres → odznaka → następny cel → wróć jutro`

### Iteracja 2

**XP + progresja Typera**

1. XP.
2. Prosty level.
3. „Ekspert typowania”.
4. Serie trafionych typów.
5. Progres i unlock po rozliczeniu meczu.

Pętla:

`typ → wróć po wynik → XP/progres → kolejny cel → kolejny typ`

Dalsze elementy gamifikacji powinny być projektowane dopiero na podstawie zachowania prawdziwych użytkowników.
