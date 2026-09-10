# Specyfikacja Techniczna: Moduł Analityki i Atrybucji Ruchu (FootQuiz)

## 1. Założenia biznesowe i prywatność (Privacy-First)
- **Cel:** Precyzyjne mierzenie źródeł pozyskiwania graczy (X, WhatsApp, fora), weryfikacja retencji D1/D7 oraz monitorowanie ukończenia pętli gry (Completion Rate).
- **Zgodność z RODO / ePrivacy (Brak Cookie Banner):**
  - Rezygnacja z Google Analytics 4 na rzecz analityki bezciasteczkowej (*cookieless*).
  - Wybór narzędzi: **Vercel Web Analytics** (ogólny ruch) + **Umami Cloud** lub **PostHog** (zdarzenia produktowe i lejki).
  - Brak zbierania danych osobowych (PII) i brak profilowania reklamowego = **brak konieczności wyświetlania banera cookies** na ekranie mobilnym gracza.

---

## 2. Architektura narzędziowa

| Narzędzie | Rola | Sposób wdrożenia | Koszt |
| :--- | :--- | :--- | :--- |
| **Vercel Web Analytics** | Ogólny ruch, geolokalizacja, typ urządzeń, Core Web Vitals | `@vercel/analytics/react` w root layout Next.js | 0 PLN (Hobby) |
| **Umami Cloud** *(lub PostHog)* | Zdarzenia niestandardowe (*custom events*), lejki, analiza kampanii UTM | Skrypt asynchroniczny lub biblioteka JS | 0 PLN (Free tier do 10k zdarzeń/mc) |

---

## 3. Standard tagowania linków (Parametry UTM)

Każdy link wychodzący do gry poza aplikacją **musi** posiadać parametry UTM, aby precyzyjnie identyfikować najskuteczniejsze kanały:

### Struktura parametrów:
- `utm_source`: Kanał / platforma (`twitter`, `whatsapp`, `messenger`, `fcbarca_forum`, `reddit`, `tiktok`)
- `utm_medium`: Typ nośnika (`organic_post`, `share_button`, `community_post`, `bio_link`)
- `utm_campaign`: Identyfikator akcji (np. `daily_challenge`, `weekend_boost`, `launch_mvp`)
- `utm_content`: Opcjonalny wariant (np. `variant_a`, `hero_post`)

### Przykłady linków produkcyjnych:
1. **Przycisk udostępniania na WhatsApp (z aplikacji):**
   `https://footquiz.pl/?utm_source=whatsapp&utm_medium=share_button&utm_campaign=daily_result`
2. **Kafelkowy post gracza na X / Twitterze:**
   `https://footquiz.pl/?utm_source=twitter&utm_medium=share_button&utm_campaign=daily_wordle`
3. **Wpis na forum klubowym (np. fani Barcelony):**
   `https://footquiz.pl/?utm_source=fcbarca_forum&utm_medium=community_post&utm_campaign=launch_mvp`
4. **Link w bio profilu TikTok / Reels:**
   `https://footquiz.pl/?utm_source=tiktok&utm_medium=bio_link&utm_campaign=profile`

---

## 4. Rejestrowane zdarzenia produktowe (Custom Events)

W aplikacji śledzimy wyłącznie kluczowe punkty styku użytkownika z grą:

### Zdarzenie 1: `quiz_started`
- **Moment wywołania:** Gracz klika przycisk „Rozpocznij Wyzwanie Dnia”.
- **Właściwości zdarzenia (Props):**
  - `challenge_id`: string (np. "2026-09-08")
  - `is_logged_in`: boolean (czy gracz jest zalogowany)

### Zdarzenie 2: `question_answered`
- **Moment wywołania:** Gracz zatwierdza odpowiedź na dane pytanie.
- **Właściwości zdarzenia (Props):**
  - `question_number`: integer (1 do 5)
  - `is_correct`: boolean
  - `time_taken_seconds`: float (czas reakcji)

### Zdarzenie 3: `quiz_completed` (Kluczowe)
- **Moment wywołania:** Gracz odpowiada na ostatnie pytanie i widzi ekran podsumowania.
- **Właściwości zdarzenia (Props):**
  - `score`: integer (0 do 5)
  - `total_time_seconds`: float
  - `streak_count`: integer (aktualna seria dni)

### Zdarzenie 4: `result_shared` (Kluczowe dla wiralowości)
- **Moment wywołania:** Gracz klika przycisk kopiowania wyniku lub bezpośredni share na social media / komunikator.
- **Właściwości zdarzenia (Props):**
  - `platform`: string (`'whatsapp'` | `'x_twitter'` | `'clipboard'` | `'native_share'`)
  - `score`: integer

### Zdarzenie 5: `match_predicted` (dla Etapu 2 – Typer)
- **Moment wywołania:** Gracz zatwierdza swój typ na Mecz Dnia (1 / X / 2).
- **Właściwości zdarzenia (Props):**
  - `match_id`: string
  - `selected_outcome`: string ('1' | 'X' | '2')

---

## 5. Implementacja kodu w Next.js (App Router)

### A. Wdrożenie Vercel Analytics w `app/layout.tsx`:
```tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pl">
      <body>
        {children}
        <Analytics/>
      </body>
    </html>
  );
}

### B. Moduł wysyłania zdarzeń lib/analytics.ts:

// Bezpieczna funkcja pomocnicza do rejestrowania zdarzeń w Umami / PostHog
export function trackEvent(eventName: string, eventData?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).umami) {
    (window as any).umami.track(eventName, eventData);
  }
}

### C. Przykład użycia przy udostępnieniu wyniku:

import { trackEvent } from '@/lib/analytics';

const handleShareWhatsApp = (score: number) => {
  trackEvent('result_shared', { platform: 'whatsapp', score });
  
  const text = encodeURIComponent(
    `FootQuiz: ${score}/5! Pobijesz mój wynik? [https://footquiz.pl/?utm_source=whatsapp&utm_medium=share_button](https://footquiz.pl/?utm_source=whatsapp&utm_medium=share_button)`
  );
  window.open(`[https://wa.me/?text=$](https://wa.me/?text=$){text}`, '_blank');
};


6. Kluczowe wskaźniki efektywności (Dashboard KPI)
Completion Rate: (Liczba quiz_completed / Liczba quiz_started) * 100% (Cel: > 85%).

K-Factor (Współczynnik wiralowości): Średnia liczba wejść z linków share_button na jednego aktywnego gracza.

D1 Retention: Procent graczy, którzy wracają następnego dnia (Cel: > 25%).

Skuteczność kanałów: Ranking źródeł UTM wg konwersji na ukończenie quizu.