import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { setSessionCookie } from '@/lib/session';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  }

  if (user.status !== 'active') {
    return NextResponse.json({ error: 'account not active' }, { status: 403 });
  }

  await setSessionCookie({ userId: user.id, role: user.role as 'admin' | 'user' });
  return NextResponse.json({ role: user.role });
}