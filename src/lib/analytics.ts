import type { AnalyticsEvent, AnalyticsEvents } from '@/types/analytics';
import { getAnalyticsIdentity, readAnalyticsConsent } from './analyticsIdentity';

import { safeAttribution } from './analyticsState';

export interface UmamiProvider {
  identify(id: string): Promise<unknown>;
  track(payload: Record<string, unknown>): Promise<unknown>;
}
let provider: UmamiProvider | null = null;
let identity: string | null = null;
let generation = 0;
let ready = false;
let pending: { id: string; name: AnalyticsEvent; data: Record<string, unknown> }[] = [];
let draining = false;
async function drainAnalytics(): Promise<void> {
  if (draining || !ready) return;
  draining = true;
  try {
    while (ready && pending.length) {
      const event = pending.shift()!;
      if (getAnalyticsIdentity() !== event.id) continue;
      const safe = sanitizeUmamiPayload('event', { id: event.id, name: event.name, data: event.data });
      try { if (safe && provider) await provider.track(safe); } catch { /* Do not retry uncertain delivery. */ }
    }
  } catch { /* Best effort. */ }
  finally { draining = false; }
}
export function enqueueAnalytics<E extends AnalyticsEvent>(name: E, data: AnalyticsEvents[E]): void {
  try {
    if (readAnalyticsConsent() !== 'accepted') return;
    const id = getAnalyticsIdentity();
    const safe = properties(name, data);
    if (!id || !safe || pending.length >= 32) return;
    pending.push({ id, name, data: safe });
    void drainAnalytics();
  } catch { /* Best effort. */ }
}

export function stopAnalytics(): void {
  generation++;
  if (readAnalyticsConsent() !== 'accepted') pending = [];
  ready = false;
  identity = null;
  provider = null;
}
export async function initializeAnalytics(candidate: UmamiProvider): Promise<void> {
  stopAnalytics();
  const current = generation;
  const id = getAnalyticsIdentity();
  if (!id) return;
  try {
    await candidate.identify(id);
    if (current !== generation || readAnalyticsConsent() !== 'accepted' || getAnalyticsIdentity() !== id) return;
    identity = id;
    provider = candidate;
    ready = true;
    void drainAnalytics();
  } catch { /* Provider failure never escapes into gameplay. */ }
}

function properties(name: string, value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const day = typeof p.challenge_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.challenge_date) &&
    Number.isFinite(Date.parse(p.challenge_date)) && new Date(p.challenge_date).toISOString().slice(0, 10) === p.challenge_date;
  if (name === 'leaderboard_viewed') return {};
  if (name === 'quiz_viewed') return p.challenge_date === undefined ? { ...safeAttribution(p) } : day ? { ...safeAttribution(p), challenge_date: p.challenge_date } : null;
  if (!day) return null;
  if (name === 'quiz_started' && typeof p.resumed === 'boolean')
    return { ...safeAttribution(p), challenge_date: p.challenge_date, resumed: p.resumed };
  if (name === 'question_answered' && Number.isInteger(p.question_number) &&
      Number(p.question_number) >= 1 && Number(p.question_number) <= 5 &&
      typeof p.correct === 'boolean' && typeof p.timed_out === 'boolean' && !(p.timed_out && p.correct))
    return { challenge_date: p.challenge_date, question_number: p.question_number, correct: p.correct, timed_out: p.timed_out };
  if (name === 'quiz_completed' && typeof p.score === 'number' && Number.isInteger(p.score) &&
      p.score >= 0 && p.score <= 5 && p.total_questions === 5)
    return { ...safeAttribution(p), challenge_date: p.challenge_date, score: p.score, total_questions: 5 };
  return null;
}

/** Applies to identify too: no default URL/query/referrer/device payload leaks. */
export function sanitizeUmamiPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> | null {
  if (readAnalyticsConsent() !== 'accepted') return null;
  const id = getAnalyticsIdentity();
  const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  if (!id || payload.id !== id || !website) return null;
  const base = { website, id, hostname: window.location.hostname, url: '/' };
  if (type === 'identify') return base;
  if (type !== 'event' || !ready || identity !== id || typeof payload.name !== 'string') return null;
  const data = properties(payload.name, payload.data);
  return data ? { ...base, name: payload.name, data } : null;
}
export async function track<E extends AnalyticsEvent>(name: E, data: AnalyticsEvents[E]): Promise<void> {
  try {
    if (!ready || !provider || readAnalyticsConsent() !== 'accepted' || getAnalyticsIdentity() !== identity) return;
    const safe = sanitizeUmamiPayload('event', { id: identity, name, data });
    if (safe) await provider.track(safe);
  } catch { /* Analytics is deliberately best effort. */ }
}
