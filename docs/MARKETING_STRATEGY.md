# FootQuiz — Marketing Strategy

Status: plan promocji MVP  
Cel: zdobycie pierwszych użytkowników, pomiar retencji i znalezienie kanałów, które warto później skalować.

---

## 1. Główne założenie

Na etapie MVP marketing FootQuiz nie ma maksymalizować zasięgu.

Najważniejszym celem jest:

> zdobyć pierwszych kilkuset graczy, sprawdzić czy wracają i dowiedzieć się, skąd przychodzą najbardziej wartościowi użytkownicy.

Dlatego:

- nie zakładamy z góry jednego „głównego” kanału,
- nie inwestujemy na starcie w płatne reklamy,
- nie próbujemy prowadzić jednocześnie wszystkich social mediów,
- najpierw testujemy retencję i organiczne mechanizmy wzrostu,
- dopiero później zwiększamy skalę działań.

Główne metryki produktu pozostają związane z retencją, przede wszystkim Day 1 i Day 7.

---

# ITERACJA 1 — pierwsze 100–300 graczy

## 2. Kanał #1 — Player → Player

Najważniejszym kanałem dystrybucji powinien być sam produkt.

Podstawowa pętla:

```text
gracz kończy Daily
        ↓
widzi wynik
        ↓
udostępnia go znajomym
        ↓
znajomy otwiera link
        ↓
gra w ten sam Daily
        ↓
otrzymuje własny wynik
        ↓
może udostępnić go dalej
```

FootQuiz powinien więc od początku traktować ekran wyników jako jednocześnie ekran dystrybucji produktu.

---

## 3. Udostępnianie wyniku

Po ukończeniu Daily gracz powinien mieć wyraźny przycisk:

**„Rzuć wyzwanie znajomym”**

Na urządzeniach mobilnych używamy Web Share API, dzięki czemu użytkownik może wysłać wynik przez WhatsApp, Messenger, Discord lub inną aplikację.

Alternatywnie dostępne powinno być kopiowanie wyniku do schowka.

### Przykład

```text
FootQuiz #42 — 4/5 ⚽

🟩🟩🟥🟩🟩

🔥 Seria: 6 dni

Pytanie nr 3 mnie załatwiło 💀
Pobijesz mnie?

[link do Daily]
```

Nie podajemy w share treści ani tematu konkretnego pytania, aby nie spoilerować dzisiejszego zestawu.

Jeżeli gracz ma 5/5:

```text
FootQuiz #42 — 5/5 🎯

🟩🟩🟩🟩🟩

🔥 Seria: 7 dni

Bez pudła.
Pobijesz mnie?

[link do Daily]
```

Share powinien być krótki, czytelny i budować naturalną rywalizację.

---

## 4. Link bezpośrednio do Daily

Udostępniony link nie powinien prowadzić wyłącznie do ogólnej strony głównej.

Odbiorca powinien możliwie szybko znaleźć się w kontekście tego samego wyzwania.

Docelowo wejście z linku może komunikować:

```text
Kuba rzucił Ci wyzwanie.

Jego wynik: 4/5

Spróbujesz go pobić?

[Zagraj]
```

W pierwszej wersji nie jest konieczny pełny system pojedynków.

Wystarczy:
- identyfikacja Daily,
- identyfikacja źródła wejścia,
- szybkie przejście do quizu.

---

## 5. Tracking źródła użytkownika

Od początku musimy wiedzieć, skąd przychodzą gracze.

Minimalnie rozróżniamy źródła takie jak:

```text
whatsapp
messenger
x
facebook_group
forum
reddit
direct
```

Może to być realizowane przez parametry linku lub równoważny mechanizm analityczny.

Przykładowo:

```text
?source=whatsapp
```

Warto również przygotować możliwość przypisania wejścia do konkretnego udostępnienia lub użytkownika:

```text
?ref=abc123
```

W Iteracji 1 referral służy zarówno do pomiaru, jak i do prostego eksperymentu z gamifikacją poleceń.

Referral uznajemy za skuteczny dopiero wtedy, gdy nowy gracz:
1. wejdzie przez link polecający,
2. rozpocznie FootQuiz,
3. ukończy swoje pierwsze oficjalne Daily.

Nie nagradzamy samego kliknięcia w link ani samej rejestracji.

Podstawowy funnel:

```text
udostępnienie
    ↓
kliknięcie
    ↓
rozpoczęcie Daily
    ↓
ukończenie pierwszego Daily
    ↓
skuteczny referral
    ↓
powrót następnego dnia
```

### Achievement „Skaut”

W pierwszej iteracji testujemy tylko jedną nagrodę za polecenia:

```text
🤝 Skaut

Zaproś 3 nowych graczy,
którzy ukończą swoje pierwsze Daily.

1 / 3
```

Po trzecim skutecznym poleceniu gracz zdobywa odznakę „Skaut”.

Nie tworzymy jeszcze wielopoziomowego programu poleceń ani nagród użytkowych. Celem jest sprawdzenie, czy widoczny progres `0/3 → 3/3` zwiększa skłonność graczy do udostępniania FootQuiz.

Mechanizm musi być odporny na wielokrotne zaliczanie tego samego nowego gracza i nie może naliczać referral za replay.

---

## 6. Metryki wiralności

Oprócz D1/D7 mierzymy co najmniej:

### Share Rate

Jaki procent osób kończących Daily używa funkcji udostępniania?

```text
liczba graczy udostępniających wynik
/
liczba ukończonych Daily
```

### Share → Visit

Ile wejść generują udostępnione wyniki?

### Share → Completed Quiz

Jaki procent osób przychodzących z udostępnionego linku kończy Daily?

### Referral D1

Jaki procent użytkowników pozyskanych przez share wraca następnego dnia?

Przykładowy funnel:

```text
1000 ukończonych Daily
↓
150 shares
↓
70 nowych wejść
↓
45 ukończonych quizów
↓
15 powrotów następnego dnia
```

Takie dane są ważniejsze niż sama liczba wyświetleń posta w social media.

---

# 7. Pierwsze zewnętrzne źródła ruchu

Celem Iteracji 1 nie jest skalowanie.

Potrzebujemy jedynie wystarczającej liczby użytkowników, aby zacząć obserwować zachowanie produktu.

Testujemy kilka źródeł równolegle.

---

## 7.1. Grupy Facebook i społeczności klubowe

To jeden z głównych kandydatów do zdobycia pierwszych 100–300 testerów.

Szukamy przede wszystkim:
- grup konkretnych klubów,
- grup ligowych,
- społeczności piłkarskich,
- forów klubowych.

Nie publikujemy masowo identycznego posta.

Komunikacja powinna być autentyczna i przedstawiać FootQuiz jako rozwijany projekt.

Przykładowy kierunek:

> Robię mały projekt FootQuiz — 5 pytań piłkarskich dziennie. Jest jeszcze we wczesnej wersji i szukam osób, które go przetestują. Dzisiejszy zestaw ma kilka trudniejszych pytań. Jeśli macie 2 minuty, chętnie przyjmę feedback.

Jeżeli dana społeczność ma zasady dotyczące autopromocji, należy ich przestrzegać.

### Cel

Nie tylko pozyskanie ruchu, ale również jakościowego feedbacku od prawdziwych kibiców.

---

## 7.2. Piłkarski X

X traktujemy jako kanał eksperymentalny, a nie z góry ustaloną oś marketingu.

Testujemy kilka formatów:

### Wynik Daily

```text
Dzisiejszy FootQuiz: 4/5.

🟩🟩🟥🟩🟩

Pytanie nr 3 wyglądało niewinnie 💀

Kto zrobi komplet?
```

### Pytanie / wyzwanie

Publikujemy pojedyncze pytanie lub jego wariant bez spoilerowania aktywnego Daily.

### Newsjacking

Przy dużym wydarzeniu piłkarskim można publikować ciekawostkę lub pytanie związane z aktualnym meczem.

Nie zakładamy jednak codziennego newsjackingu jako obowiązkowego procesu.

### Interakcja ze społecznością

Konto FootQuiz może naturalnie uczestniczyć w rozmowach piłkarskich, szczególnie tam, gdzie pojawiają się statystyki, historia futbolu i quizowe ciekawostki.

Nie spamujemy linkiem pod niezwiązanymi wpisami.

---

## 7.3. Własna sieć kontaktów

Pierwszych użytkowników warto również pozyskać bezpośrednio:

- grupy WhatsApp,
- Messenger,
- Discord,
- znajomi interesujący się piłką,
- współpracownicy,
- grupy kibicowskie, do których twórca faktycznie należy.

To mały kanał, ale bardzo wartościowy podczas testowania:
- działania share,
- zrozumiałości produktu,
- błędów UX,
- pierwszej retencji.

---

# 8. Feedback loop

Pierwszych 100–300 użytkowników traktujemy przede wszystkim jako testerów produktu.

Po Daily można dodać bardzo prosty feedback:

```text
Jak oceniasz dzisiejszy zestaw?

😕   😐   🔥
```

oraz:

**„Znalazłeś błąd w pytaniu? Zgłoś”**

W quizie wiedzy wiarygodność pytań jest szczególnie ważna. Błędne lub niejednoznaczne pytanie może szybko obniżyć zaufanie najbardziej zaangażowanych graczy.

Feedback powinien być możliwie lekki i nie przeszkadzać w głównym flow.

---

# 9. Kryteria sukcesu Iteracji 1

Nie ustalamy sukcesu wyłącznie jako „zdobyliśmy 300 użytkowników”.

Chcemy odpowiedzieć na pytania:

1. Czy ludzie kończą rozpoczęty Daily?
2. Czy wracają następnego dnia?
3. Czy wracają po tygodniu?
4. Czy udostępniają wyniki?
5. Czy share generuje nowych graczy?
6. Które źródła generują użytkowników o najwyższej retencji?
7. Jakie problemy najczęściej zgłaszają gracze?

Najważniejsze metryki:

- Daily completion rate,
- D1 retention,
- D7 retention,
- Share Rate,
- Share → Visit,
- Share → Completed Quiz,
- liczba skutecznych referrali,
- odsetek graczy z co najmniej 1 skutecznym referralem,
- wpływ progresu „Skaut” na Share Rate,
- retention według źródła pozyskania.

Orientacyjnym sygnałem, że warto zwiększać skalę, jest D1 na poziomie około 25–30% lub więcej, ale wynik powinien być interpretowany razem z wielkością próby i pozostałymi metrykami.

---

# 10. Czego NIE robimy w Iteracji 1

Na tym etapie nie:

- kupujemy Meta Ads / Google Ads,
- budujemy dużej strategii SEO,
- publikujemy obowiązkowo codziennie na wszystkich platformach,
- kontaktujemy dziesiątek influencerów,
- budujemy pełnego programu afiliacyjnego,
- nagradzamy referral monetami, przedmiotami ani innymi nagrodami użytkowymi,
- rozbudowujemy poleceń poza prosty achievement „Skaut” za 3 skuteczne zaproszenia,
- tworzymy rozbudowanego systemu pojedynków,
- inwestujemy dużo czasu w produkcję wideo.

Najpierw sprawdzamy, czy produkt zatrzymuje użytkowników.

---

# ITERACJA 2 — skalowanie działających mechanizmów

Iteracja 2 rozpoczyna się dopiero wtedy, gdy mamy pierwsze dane pokazujące, że użytkownicy wracają i potrafimy zmierzyć źródła ruchu.

Nie wszystkie poniższe kanały muszą zostać uruchomione jednocześnie.

---

## 11. Short-form video — TikTok / Reels / Shorts

To kanał o dużym potencjale organicznym, ale wymagający regularnej produkcji.

Nie zaczynamy od założenia:

> „publikujemy jeden film dziennie”.

Najpierw przeprowadzamy ograniczony eksperyment.

### Pierwszy test

Przygotować około 10–15 materiałów w 2–3 różnych formatach.

Przykładowe formaty:

**„95% kibiców tego nie wie”**

```text
Który piłkarz...?
Masz 5 sekund.
```

**„Masz 3 sekundy”**

Szybkie pytanie + countdown + odpowiedź.

**„Dzisiejszy killer”**

Pytanie podobne do tego, które sprawia graczom najwięcej problemów, bez spoilerowania aktywnego Daily.

**„Kto grał w tych klubach?”**

Krótki format oparty na karierze zawodnika.

### Produkcja

Nie trzeba pokazywać twarzy.

Można wykorzystać:
- nagranie aplikacji,
- tekst na ekranie,
- własny głos lub prosty voice-over,
- dynamiczny montaż.

### Co mierzymy

Nie optymalizujemy wyłącznie pod views.

Interesują nas:

```text
video views
↓
profile/link clicks
↓
Daily started
↓
Daily completed
↓
D1
```

Dopiero zwycięski format warto produkować regularnie.

---

# 12. Rozszerzenie działań na X

Jeżeli dane pokażą, że X dostarcza wartościowych użytkowników, zwiększamy aktywność.

Możliwe działania:
- regularne wyniki Daily,
- quizowe ciekawostki,
- reakcje na bieżące mecze,
- newsjacking,
- ankiety,
- dyskusje z kibicami,
- okazjonalne specjalne zestawy.

Decyzja o traktowaniu X jako głównego kanału powinna wynikać z danych, nie z założenia strategii.

---

# 13. Mikro-twórcy piłkarscy

Po potwierdzeniu, że FootQuiz zatrzymuje użytkowników, można testować współpracę z małymi twórcami.

Preferowani są twórcy z zaangażowaną społecznością piłkarską, a nie wyłącznie dużą liczbą obserwujących.

Przykładowa współpraca:

**„Wyzwanie Dnia stworzone z [Twórca]”**

Twórca:
- rozwiązuje zestaw,
- publikuje swój wynik,
- rzuca wyzwanie widzom.

Na początku testujemy pojedyncze współprace zamiast budować szeroki program influencerski.

Każdy twórca powinien otrzymać osobno mierzalny link/referral.

Dzięki temu możemy porównać:
- wejścia,
- ukończenia,
- D1,
- D7,
- share rate pozyskanych użytkowników.

---

# 14. Challenge link — potencjalne rozszerzenie PLG

Jeżeli zwykłe udostępnianie wyniku działa, można rozwinąć je w bardziej bezpośrednie wyzwanie.

Przykład:

```text
Kuba rzucił Ci wyzwanie ⚽

Kuba: 4/5

Zagraj w FootQuiz #42
i spróbuj go pokonać.

[Podejmij wyzwanie]
```

Po ukończeniu:

```text
Ty: 5/5
Kuba: 4/5

Wygrałeś 🎯

[Rzuć wyzwanie dalej]
```

To nie jest wymagane w MVP.

Mechanizm powinien powstać dopiero wtedy, gdy dane pokażą, że użytkownicy faktycznie korzystają ze zwykłego share.

---

# 15. Jak wybieramy kanały do skalowania

Kanału nie oceniamy tylko po liczbie wejść.

Przykład:

```text
TikTok:
1000 wejść
D1 = 8%

Grupa FB:
150 wejść
D1 = 32%
```

Na etapie FootQuiz grupa FB może być znacznie bardziej wartościowym źródłem mimo mniejszego wolumenu.

Dla każdego kanału patrzymy przede wszystkim na:

1. liczbę nowych użytkowników,
2. Daily completion,
3. D1,
4. D7,
5. Share Rate,
6. koszt/czas potrzebny do pozyskania ruchu.

Skalujemy kanały, które dostarczają **powracających graczy**, a nie tylko kliknięcia.

---

# 16. Relacja marketingu z systemem achievementów

Marketing i progresja produktu powinny się wzajemnie wzmacniać.

Przykładowy share może później zawierać:

```text
FootQuiz #42 — 5/5 🎯

🟩🟩🟩🟩🟩

🔥 Seria: 7 dni
🏆 Tydzień w formie

Pobijesz mnie?
```

Daje to graczowi dodatkowy powód do pokazania wyniku i buduje społeczny prestiż bez tworzenia skomplikowanego systemu nagród.

Nie należy jednak przeładowywać share'a informacjami. W pierwszej kolejności testujemy prostą wersję, a achievement/streak traktujemy jako element do eksperymentów.

---

# 17. Roadmapa marketingowa

## Iteracja 1 — pierwsze 100–300 graczy

Priorytety:

1. dobry share wyniku,
2. Web Share + kopiowanie wyniku,
3. link prowadzący bezpośrednio do Daily,
4. tracking źródła/referral,
5. achievement „Skaut” za 3 skuteczne polecenia,
6. pierwsze grupy FB i społeczności piłkarskie,
7. testy X,
8. własna sieć kontaktów,
9. prosty feedback po Daily,
10. pomiar D1/D7, funnelu share i skutecznych referrali.

Cel:

> sprawdzić, czy FootQuiz zatrzymuje graczy i czy użytkownicy sami pomagają go dystrybuować.

---

## Iteracja 2 — skalowanie

Uruchamiamy dopiero po zebraniu danych z Iteracji 1.

Potencjalne działania:

1. eksperyment 10–15 short-form videos,
2. skalowanie najlepszego formatu contentowego,
3. zwiększenie aktywności na najlepszym kanale społecznościowym,
4. pojedyncze współprace z mikro-twórcami,
5. ewentualne rozwinięcie share w challenge link.

Cel:

> zwiększać ruch tylko tam, gdzie potrafimy pozyskać użytkowników, którzy później wracają.

---

# 18. Zasada końcowa

Marketing FootQuiz na etapie MVP nie powinien być osobnym „działem promocji”.

Powinien być przedłużeniem produktu:

```text
dobry Daily
    ↓
satysfakcjonujący wynik
    ↓
streak / progres
    ↓
naturalna chęć podzielenia się wynikiem
    ↓
nowy gracz
    ↓
kolejny Daily następnego dnia
```

Najpierw budujemy tę pętlę.

Dopiero kiedy dane pokażą, że działa, dokładamy skalę.

## 19. Strategia ekspansji językowej (PL → EN)

Zaczynamy od walidacji w Polsce, ale od pierwszego dnia unikamy zamykania się w lokalnej niszy:

- **Globalny branding od startu:**
  - Domena międzynarodowa (`.com` lub `.app`).
  - Uniwersalne nazwy profili społecznościowych (np. `@FootQuizApp`, `@PlayFootQuiz`) — bez dopisków typu `PL` czy `_pl`.
  - Neutralne logo i bio od początku po angielsku.
  - Brak podwójnych kont na start (jedno konto do zarządzania).

- **Dystrybucja w fazie PL:**
  - Ruch pozyskujemy głównie z **kont osobistych** (grupy FB, fora, bezpośrednie kontakty), co nie „brudzi” profilu marki.
  - Oficjalny profil na X może włączać się w dyskusje po polsku, ale sam format share/kafelków i formalne komunikaty powinny być możliwie uniwersalne.

- **Formaty wideo (TikTok / Shorts):**
  - Brak polskiego lektora — formaty oparte na tekście na ekranie i muzyce (tekst od razu po angielsku lub uniwersalny, zrozumiały dla polskich kibiców), co zapobiega zablokowaniu konta w lokalnej bańce algorytmicznej.

- **Przygotowanie techniczne (i18n):**
  - Uniwersalna pętla share: kafelki (🟩🟩🟥🟩🟩) nie wymagają tłumaczeń.
  - Linki z parametrem językowym (np. `?lang=pl` / `/pl/daily`), co ułatwi płynne przejście na EN w kolejnych iteracjach bez migracji profili czy domen.