import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE,
  createSessionToken,
  getAuthSecret,
  getSitePassword,
  timingSafeCompare,
} from '@/lib/auth';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

export async function POST(req: NextRequest) {
  try {
    // 1. Enforce strict brute-force protection (5 attempts per minute per IP, 5-minute ban)
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(clientIp, {
      maxRequests: 5,
      windowMs: 60_000,
      banDurationMs: 300_000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too Many Requests',
          detail: `Too many failed passcode attempts. Please wait ${rateLimit.retryAfterSeconds} seconds before trying again.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds || 60),
            'X-RateLimit-Limit': String(rateLimit.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // 2. Parse request payload
    let body: { password?: string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Bad Request', detail: 'Invalid JSON payload structure.' },
        { status: 400 }
      );
    }

    const { password } = body;
    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Bad Request', detail: 'Password field is required.' },
        { status: 400 }
      );
    }

    // 3. Constant-time timing-safe passcode comparison
    const configuredPassword = getSitePassword();
    const isValid = timingSafeCompare(password.trim(), configuredPassword.trim());

    if (!isValid) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          detail: 'Incorrect access passcode. Please check and try again.',
          remainingAttempts: rateLimit.remaining,
        },
        { status: 401 }
      );
    }

    // 4. Generate cryptographically signed HMAC-SHA256 session token
    const token = await createSessionToken(getAuthSecret(), AUTH_COOKIE_MAX_AGE);

    // 5. Construct response with HttpOnly, Secure, SameSite=Lax cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const response = NextResponse.json(
      {
        success: true,
        message: 'Authentication successful. Workspace unlocked.',
      },
      { status: 200 }
    );

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return response;
  } catch (err: unknown) {
    console.error('Authentication error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', detail: 'Authentication verification failed.' },
      { status: 500 }
    );
  }
}
