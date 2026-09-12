export type AnalyticsConsent = 'unknown' | 'accepted' | 'rejected';
export const ANALYTICS_KEYS = {
  consent: 'footquiz_analytics_consent',
  identity: 'footquiz_analytics_id',
  attribution: 'footquiz_analytics_attribution',
  dedup: 'footquiz_analytics_dedup',
} as const;
export const CONSENT_EVENT = 'footquiz-analytics-consent';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let blocked = false;
export function readAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === 'undefined' || blocked) return 'unknown';
  try {
    const value = window.localStorage.getItem(ANALYTICS_KEYS.consent);
    return value === 'accepted' || value === 'rejected' ? value : 'unknown';
  } catch { return 'unknown'; }
}
export function clearAnalyticsData(): void {
  if (typeof window === 'undefined') return;
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    for (const key of [ANALYTICS_KEYS.identity, ANALYTICS_KEYS.attribution, ANALYTICS_KEYS.dedup]) {
      try { window[name].removeItem(key); } catch { /* Best effort if storage is inaccessible. */ }
    }
  }
}
export function setAnalyticsConsent(value: 'accepted' | 'rejected'): void {
  blocked = true;
  if (value === 'rejected') clearAnalyticsData();
  try {
    window.localStorage.setItem(ANALYTICS_KEYS.consent, value);
    blocked = false;
  } catch { /* Fail closed, including failed consent persistence. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONSENT_EVENT));
}
export function getAnalyticsIdentity(): string | null {
  if (readAnalyticsConsent() !== 'accepted') return null;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_KEYS.identity);
    if (stored && uuid.test(stored)) return stored;
    const id = window.crypto.randomUUID();
    if (!uuid.test(id)) return null;
    window.localStorage.setItem(ANALYTICS_KEYS.identity, id);
    return id;
  } catch { return null; }
}
