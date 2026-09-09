// Bezpieczna funkcja pomocnicza do rejestrowania zdarzeń w Umami / PostHog
export function trackEvent(eventName: string, eventData?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).umami) {
    (window as any).umami.track(eventName, eventData);
  }
}