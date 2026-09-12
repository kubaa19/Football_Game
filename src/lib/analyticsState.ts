import { ANALYTICS_KEYS, getAnalyticsIdentity, readAnalyticsConsent } from './analyticsIdentity';
export interface Attribution {
  utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string;
}
const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const;
export function safeAttribution(value: unknown): Attribution {
  const result: Attribution = {};
  if (!value || typeof value !== 'object') return result;
  const data = value as Record<string, unknown>;
  for (const key of fields) {
    const v = data[key];
    if (typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v)) result[key] = v;
  }
  return result;
}
export function captureAttribution(): void {
  if (readAnalyticsConsent() !== 'accepted') return;
  try {
    const params = new URL(window.location.href).searchParams;
    if (!fields.some(key => params.has(key))) return;
    const input: Record<string, unknown> = {};
    for (const key of fields) input[key] = params.get(key);
    window.sessionStorage.setItem(ANALYTICS_KEYS.attribution, JSON.stringify(safeAttribution(input)));
  } catch { /* Optional attribution. */ }
}
export function readAttribution(): Attribution {
  if (readAnalyticsConsent() !== 'accepted') return {};
  try {
    captureAttribution();
    return safeAttribution(JSON.parse(window.sessionStorage.getItem(ANALYTICS_KEYS.attribution) ?? '{}'));
  } catch { return {}; }
}
/** Local-only keys. Never put this register or its attempt IDs in a provider payload. */
export function claimAnalyticsEvent(key: string): boolean {
  if (readAnalyticsConsent() !== 'accepted') return false;
  try {
    const id = getAnalyticsIdentity();
    if (!id || key.length > 160) return false;
    const raw: unknown = JSON.parse(window.localStorage.getItem(ANALYTICS_KEYS.dedup) ?? 'null');
    const state = raw && typeof raw === 'object' ? raw as { identity?: unknown; keys?: unknown } : null;
    const keys = state?.identity === id && Array.isArray(state.keys)
      ? state.keys.filter((k): k is string => typeof k === 'string' && k.length <= 160).slice(-511) : [];
    if (keys.includes(key)) return false;
    keys.push(key);
    window.localStorage.setItem(ANALYTICS_KEYS.dedup, JSON.stringify({ identity: id, keys }));
    return true;
  } catch { return false; }
}
