import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, getAuthSecret, verifySessionToken } from './lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow internal Next.js assets, favicon, and public auth endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname === '/favicon.ico' ||
    pathname === '/api/auth/login'
  ) {
    return NextResponse.next();
  }

  // 2. Extract and verify session cookie
  const cookie = req.cookies.get(AUTH_COOKIE_NAME);
  const secret = getAuthSecret();
  const isAuthenticated = await verifySessionToken(cookie?.value, secret);

  // 3. Handle login page access
  if (pathname === '/login') {
    if (isAuthenticated) {
      // Already logged in, redirect directly to workspace
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

  // 4. Protect all other pages and API endpoints
  if (!isAuthenticated) {
    // If an API route is requested without authentication, reject immediately at the Edge
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          detail: 'Valid authentication passcode session required to access SheetSnap APIs.',
        },
        { status: 401 }
      );
    }

    // If a UI page is requested, redirect to the login gate
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
