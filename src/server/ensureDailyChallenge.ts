import 'server-only';
import { createSupabaseAdmin } from './supabaseAdmin';

export class EnsureDailyChallengeError extends Error {
  constructor(readonly code: 'DAILY_CHALLENGE_UNAVAILABLE' | 'DAILY_CHALLENGE_INVALID' | 'ATTEMPT_START_UNAVAILABLE') {
    super(code);
  }
}

/** Internal only: caller supplies a server-calculated UTC day, never browser input. */
export async function ensureDailyChallenge(today: string) {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today) ||
        !Number.isFinite(Date.parse(today)) || new Date(today).toISOString().slice(0, 10) !== today) {
      throw new EnsureDailyChallengeError('ATTEMPT_START_UNAVAILABLE');
    }
    const { data, error } = await createSupabaseAdmin().rpc('ensure_daily_challenge', { p_date: today });
    if (error) {
      if (error.code === 'P0001' && error.message === 'INSUFFICIENT_ELIGIBLE_QUESTIONS') {
        throw new EnsureDailyChallengeError('DAILY_CHALLENGE_UNAVAILABLE');
      }
      if (error.code === 'P0001' && error.message === 'DAILY_CHALLENGE_INVALID') {
        throw new EnsureDailyChallengeError('DAILY_CHALLENGE_INVALID');
      }
      throw new EnsureDailyChallengeError('ATTEMPT_START_UNAVAILABLE');
    }
    const isId = (id: unknown): id is string => typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
    if (!data || typeof data !== 'object' || Array.isArray(data) ||
        !isId(data.challengeId) || data.challengeDate !== today || typeof data.created !== 'boolean' ||
        !Array.isArray(data.questionIds) || data.questionIds.length !== 5 ||
        !data.questionIds.every(isId) || new Set(data.questionIds).size !== 5) {
      throw new EnsureDailyChallengeError('DAILY_CHALLENGE_INVALID');
    }
    return {
      challengeId: data.challengeId as string,
      challengeDate: today,
      questionIds: [...data.questionIds] as string[],
      created: data.created as boolean,
    };
  } catch (error) {
    if (error instanceof EnsureDailyChallengeError) throw error;
    throw new EnsureDailyChallengeError('ATTEMPT_START_UNAVAILABLE');
  }
}
