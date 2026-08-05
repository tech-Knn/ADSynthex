import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/session';

type AdminGuard = { session: Session } | { error: NextResponse };

export async function requireAdmin(): Promise<AdminGuard> {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  if (session.role !== 'admin') {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { session };
}