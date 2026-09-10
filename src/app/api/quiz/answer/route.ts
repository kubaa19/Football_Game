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
  ['INVALID_SELECTED_INDEX', [400, 'INVALID_SELECTED_INDEX']],
  ['ATTEMPT_NOT_FOUND', [404, 'ATTEMPT_NOT_FOUND']],
  ['ATTEMPT_FORBIDDEN', [403, 'ATTEMPT_FORBIDDEN']],
  ['ATTEMPT_COMPLETED', [409, 'ATTEMPT_COMPLETED']],
  ['ATTEMPT_EXPIRED', [409, 'ATTEMPT_EXPIRED']],
  ['QUESTION_NOT_IN_CHALLENGE', [403, 'QUESTION_NOT_IN_CHALLENGE']],
  ['QUESTION_OUT_OF_ORDER', [409, 'QUESTION_OUT_OF_ORDER']],
  ['ANSWER_ALREADY_RECORDED', [409, 'ANSWER_ALREADY_RECORDED']],
  ['CHALLENGE_INVALID', [500, 'DAILY_CHALLENGE_INVALID']],
  ['QUESTION_DATA_INVALID', [500, 'QUESTION_DATA_INVALID']],
  ['ATTEMPT_DATA_INVALID', [500, 'ATTEMPT_DATA_INVALID']],
]);

// Same policy as attempt/start; do not derive trust from request host headers.
function allowedOrigin(): string | null {
  const configured = process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null);
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash ||
        (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const trustedOrigin = allowedOrigin();
  if (!origin || !trustedOrigin || origin !== trustedOrigin) {
    return fail('ORIGIN_FORBIDDEN', 403);
  }
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (request.nextUrl.search !== '' || contentType !== 'application/json') {
    return fail('INVALID_REQUEST', 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_REQUEST', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return fail('INVALID_REQUEST', 400);
  }
  const input = body as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== 3 ||
      keys.some(key => !['attemptId', 'questionId', 'selectedIndex'].includes(key)) ||
      !isUuid(input.attemptId) || !isUuid(input.questionId) ||
      typeof input.selectedIndex !== 'number' || !Number.isInteger(input.selectedIndex) ||
      input.selectedIndex < -1 || input.selectedIndex > 3) {
    return fail('INVALID_REQUEST', 400);
  }
  const attemptId = input.attemptId.toLowerCase();
  const questionId = input.questionId.toLowerCase();
  const selectedIndex = input.selectedIndex;

  try {
    const identity = readAnonymousIdentity(request);
    if (!identity) return fail('ANONYMOUS_IDENTITY_REQUIRED', 401);

    const db = createSupabaseAdmin();
    const { data, error } = await db.rpc('record_quiz_attempt_answer', {
      p_attempt_id: attemptId,
      p_owner_hash: identity.ownerHash,
      p_question_id: questionId,
      p_selected_index: selectedIndex,
    });
    if (error) {
      const mapped = error.code === 'P0001' ? rpcErrors.get(error.message) : undefined;
      return mapped ? fail(mapped[1], mapped[0]) : fail('ANSWER_UNAVAILABLE', 503);
    }

    const payload: unknown = data;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return fail('ANSWER_DATA_INVALID', 500);
    }
    const feedback = payload as Record<string, unknown>;
    // Current RPC always returns questionId/selectedIndex and coalesces explanation.
    // attemptId is checked too if a future RPC version includes it.
    if (typeof feedback.correct !== 'boolean' ||
        typeof feedback.correctIndex !== 'number' ||
        !Number.isInteger(feedback.correctIndex) ||
        feedback.correctIndex < 0 || feedback.correctIndex > 3 ||
        typeof feedback.explanation !== 'string' ||
        typeof feedback.replayed !== 'boolean' ||
        !isUuid(feedback.questionId) || feedback.questionId.toLowerCase() !== questionId ||
        feedback.selectedIndex !== selectedIndex ||
        ('attemptId' in feedback &&
          (!isUuid(feedback.attemptId) || feedback.attemptId.toLowerCase() !== attemptId)) ||
        (selectedIndex === -1 && feedback.correct)) {
      return fail('ANSWER_DATA_INVALID', 500);
    }

    return NextResponse.json({
      correct: feedback.correct,
      correctIndex: feedback.correctIndex,
      explanation: feedback.explanation,
      replayed: feedback.replayed,
    }, { headers });
  } catch {
    // Never expose raw errors, credentials or RPC payloads.
    return fail('ANSWER_UNAVAILABLE', 503);
  }
}