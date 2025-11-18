import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasAccessToRoute, getFeedTypeFromRoute } from './lib/account-access-control';

// Define paths that don't require authentication
const publicPaths = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/google-ads/accounts',
  '/api/google-ads-production',
  '/api/test',
  '/api/test-db',
  '/api/setup-db',
  '/api/setup-indexes',
  '/api/cleanup-db',
  '/api/check-db-data',
  '/api/dashboard-v2',
  '/api/cron/',  // Changed: Added trailing slash to match all cron routes
  '/api/sync-status',
  '/api/manual-sync',
  '/api/currency/refresh',
  '/logout'
];

// Check if a path is public
const isPublicPath = (path: string) => {
  return publicPaths.some(publicPath => path.startsWith(publicPath));
};

// Middleware function that runs on every request
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // If trying to access root, redirect to login
  if (pathname === '/') {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
  
  // Skip middleware for public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }
  
  // Check for authentication cookie
  const authType = request.cookies.get('auth_type')?.value;
  const sessionId = request.cookies.get('session_id')?.value;
  
  // If not authenticated, redirect to login page
  if (!authType || !sessionId) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // For regular users (not admins), enforce feed-level access control
  if (authType === 'user') {
    const accountId = request.cookies.get('account_id')?.value;

    if (accountId) {
      // Check if user has access to the requested feed/route
      const feedType = getFeedTypeFromRoute(pathname);

      if (feedType) {
        // This is a feed route - check access
        if (!hasAccessToRoute(accountId, pathname)) {
          console.log(`[MIDDLEWARE] Access denied: Account ${accountId} attempted to access ${pathname}`);

          // Redirect to unauthorized page or login
          const unauthorizedUrl = new URL('/login?error=unauthorized', request.url);
          return NextResponse.redirect(unauthorizedUrl);
        }
      }

      // For Ads.com dashboard, enforce account parameter
      if (pathname.includes('/dashboard')) {
        const params = new URL(request.url).searchParams;
        const requestedAccount = params.get('account');

        // If no account requested or different account requested, redirect to user's account
        if (!requestedAccount || requestedAccount !== accountId) {
          const accountUrl = new URL(`/dashboard?account=${accountId}`, request.url);
          return NextResponse.redirect(accountUrl);
        }
      }
    }
  }

  // If authenticated and authorized, proceed with the request
  return NextResponse.next();
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 