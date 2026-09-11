import { NextRequest, NextResponse } from 'next/server';
import { readAnonymousIdentity } from '@/server/anonymousIdentity';
import { createSupabaseAdmin } from '@/server/supabaseAdmin';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const fail = (code: string, status: number) =>
  NextResponse.json({ error: { code } }, { status, headers });
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && value.length === 36 &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const rpcErrors = new Map<string, [number, string]>([
  ['INVALID_ARGUMENT', [400, 'INVALID_REQUEST']],
  ['INVALID_USERNAME', [400, 'INVALID_USERNAME']],
  ['ATTEMPT_NOT_FOUND', [404, 'ATTEMPT_NOT_FOUND']],
  ['ATTEMPT_FORBIDDEN', [403, 'ATTEMPT_FORBIDDEN']],
  ['ATTEMPT_EXPIRED', [409, 'ATTEMPT_EXPIRED']],
  ['ATTEMPT_INCOMPLETE', [409, 'ATTEMPT_INCOMPLETE']],
  ['CHALLENGE_INVALID', [500, 'DAILY_CHALLENGE_INVALID']],
  ['ATTEMPT_DATA_INVALID', [500, 'ATTEMPT_DATA_INVALID']],
  ['ATTEMPT_RESULT_MISSING', [500, 'ATTEMPT_RESULT_MISSING']],
]);

// Identical policy to start/answer; never trust Host or X-Forwarded-Host.
function allowedOrigin(): string | null {
  const configured = process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null);
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const trustedOrigin = allowedOrigin();
  if (!origin || !trustedOrigin || origin !== trustedOrigin) return fail('ORIGIN_FORBIDDEN', 403);
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (request.nextUrl.search !== '' || contentType !== 'application/json') {
    return fail('INVALID_REQUEST', 400);
  }
  let body: unknown;
  try { body = await request.json(); } catch { return fail('INVALID_REQUEST', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('INVALID_REQUEST', 400);
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== 2 || keys.some(key => key !== 'attemptId' && key !== 'username') ||
      !isUuid(input.attemptId)) return fail('INVALID_REQUEST', 400);
  if (typeof input.username !== 'string') return fail('INVALID_USERNAME', 400);
  const username = input.username.trim();
  if (!username || Array.from(username).length > 20) return fail('INVALID_USERNAME', 400);
  const attemptId = input.attemptId.toLowerCase();

  try {
    const identity = readAnonymousIdentity(request);
    if (!identity) return fail('ANONYMOUS_IDENTITY_REQUIRED', 401);
    const db = createSupabaseAdmin();
    const { data, error } = await db.rpc('finish_quiz_attempt', {
      p_attempt_id: attemptId,
      p_owner_hash: identity.ownerHash,
      p_username: username,
    });
    if (error) {
      const mapped = error.code === 'P0001' ? rpcErrors.get(error.message) : undefined;
      return mapped ? fail(mapped[1], mapped[0]) : fail('FINISH_UNAVAILABLE', 503);
    }

    const payload = data as Record<string, unknown> | null;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
        payload.success !== true || typeof payload.replayed !== 'boolean' ||
        !payload.result || typeof payload.result !== 'object' || Array.isArray(payload.result)) {
      return fail('FINISH_DATA_INVALID', 500);
    }
    const result = payload.result as Record<string, unknown>;
    if (!isUuid(result.id) || !isUuid(result.attempt_id) ||
        result.attempt_id.toLowerCase() !== attemptId ||
        typeof result.score !== 'number' || !Number.isInteger(result.score) ||
        typeof result.total_questions !== 'number' || !Number.isInteger(result.total_questions) ||
        result.total_questions < 1 || result.total_questions > 32767 ||
        result.score < 0 || result.score > result.total_questions ||
        typeof result.answers_pattern !== 'string' ||
        result.answers_pattern.length !== result.total_questions || /[^01]/.test(result.answers_pattern) ||
        typeof result.username !== 'string' || !result.username.trim() ||
        Array.from(result.username).length > 20 ||
        typeof result.played_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(result.played_at)) {
      return fail('FINISH_DATA_INVALID', 500);
    }

    // Map persisted values only. The RPC does not return completed_at.
    return NextResponse.json({
      attemptId,
      result: {
        id: result.id,
        score: result.score,
        totalQuestions: result.total_questions,
        answersPattern: result.answers_pattern,
        username: result.username,
        playedAt: result.played_at,
      },
      replayed: payload.replayed,
    }, { headers });
  } catch {
    return fail('FINISH_UNAVAILABLE', 503);
  }
}
