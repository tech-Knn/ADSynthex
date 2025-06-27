import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define paths that don't require authentication
const publicPaths = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
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

  // For Dashboard access, apply different rule for users vs admins
  if (pathname.includes('/dashboard')) {
    const accountId = request.cookies.get('account_id')?.value;
    
    // If user is not an admin, force their account parameter
    if (authType === 'user' && accountId) {
      // Get the current requested account from query params
      const params = new URL(request.url).searchParams;
      const requestedAccount = params.get('account');
      
      // If no account requested or different account requested, redirect to user's account
      if (!requestedAccount || requestedAccount !== accountId) {
        const accountUrl = new URL(`/dashboard?account=${accountId}`, request.url);
        return NextResponse.redirect(accountUrl);
      }
    }
  }
  
  // If authenticated, proceed with the request
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