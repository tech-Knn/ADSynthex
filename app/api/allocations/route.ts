import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { userId, accountCid } = await req.json();
  if (!userId || !accountCid) {
    return NextResponse.json({ error: 'userId and accountCid required' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.allocation.updateMany({
      where: { accountCid, removedAt: null },
      data: { removedAt: new Date() },
    });
    await tx.allocation.create({ data: { userId, accountCid } });
  });

  return NextResponse.json({ ok: true });
}