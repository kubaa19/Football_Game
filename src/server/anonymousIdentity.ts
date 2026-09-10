import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

const MAX_AGE = 15552000;
const SECRET_FORMAT = /^[0-9a-f]{64}$/;

export interface AnonymousIdentity {
  /** Server credential: never serialize this object or log its ownerHash. */
  readonly ownerHash: string;
  setCookie(response: NextResponse): void;
}

function cookieSettings() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    name: secure ? '__Host-footquiz-anon' : 'footquiz-anon-dev',
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE,
  };
}

function identityFromSecret(secret: string): AnonymousIdentity {
  // Hash the UTF-8 text, not the bytes decoded from the hex representation.
  const ownerHash = createHash('sha256').update(secret, 'utf8').digest('hex');
  return {
    ownerHash,
    setCookie(response) {
      response.cookies.set({ ...cookieSettings(), value: secret });
    },
  };
}

/** Missing/malformed cookies do not create an identity in answer/finish flows. */
export function readAnonymousIdentity(request: NextRequest): AnonymousIdentity | null {
  const value = request.cookies.get(cookieSettings().name)?.value;
  return typeof value === 'string' && SECRET_FORMAT.test(value)
    ? identityFromSecret(value)
    : null;
}

/** Only start is allowed to create a new anonymous identity. */
export function getOrCreateAnonymousIdentity(request: NextRequest): AnonymousIdentity {
  return readAnonymousIdentity(request)
    ?? identityFromSecret(randomBytes(32).toString('hex'));
}