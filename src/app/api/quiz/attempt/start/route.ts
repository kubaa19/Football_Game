import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAnonymousIdentity } from '@/server/anonymousIdentity';
import { startQuizAttempt, QuizAttemptStartError } from '@/server/startQuizAttempt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };
const fail = (code: string, status: number) =>
  NextResponse.json({ error: { code } }, { status, headers });

function allowedOrigin(): string | null {
  // next dev uses port 3000 by default. Other ports/hosts require APP_ORIGIN.
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
  if (request.nextUrl.search !== '') {
    return fail('INVALID_REQUEST', 400);
  }

  try {
    if ((await request.arrayBuffer()).byteLength !== 0) {
      return fail('INVALID_REQUEST', 400);
    }
  } catch {
    return fail('INVALID_REQUEST', 400);
  }

  try {
    const identity = getOrCreateAnonymousIdentity(request);
    const result = await startQuizAttempt(identity.ownerHash);
    const response = NextResponse.json(result, {
      status: result.resumed ? 200 : 201,
      headers,
    });
    // Renew only on success, preserving the existing secret.
    identity.setCookie(response);
    return response;
  } catch (error) {
    if (error instanceof QuizAttemptStartError) return fail(error.code, error.status);
    return fail('ATTEMPT_START_UNAVAILABLE', 503);
  }
}