import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

const publicPaths = [
  '/login',
  '/api/auth/login',
  '/api/health',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Server-to-server bypass for the sync cron — KEEP THIS
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.next();
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get('session')?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // API routes get 401 JSON; pages redirect to /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};