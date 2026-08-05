import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { email, username, password, accountCids } = await req.json();
  if (!email || !username || !password) {
    return NextResponse.json({ error: 'email, username and password required' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) {
    return NextResponse.json({ error: 'email or username taken' }, { status: 409 });
  }

  // block accounts already open under another user
  if (Array.isArray(accountCids) && accountCids.length > 0) {
    const taken = await prisma.allocation.findMany({
      where: { accountCid: { in: accountCids }, removedAt: null },
      select: { accountCid: true },
    });
    if (taken.length > 0) {
      return NextResponse.json(
        { error: `Account(s) already allocated: ${taken.map(t => t.accountCid).join(', ')}` },
        { status: 409 },
      );
    }
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, username, passwordHash, role: 'user', status: 'active', approvedAt: new Date() },
    });
    if (Array.isArray(accountCids) && accountCids.length > 0) {
      for (const cid of accountCids) {
        await tx.allocation.create({ data: { userId: user.id, accountCid: cid } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}