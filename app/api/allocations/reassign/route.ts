import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { userId, accountCids } = await req.json(); // desired final set for this user
  if (!userId || !Array.isArray(accountCids)) {
    return NextResponse.json({ error: 'userId and accountCids required' }, { status: 400 });
  }

  // block allocating to a rejected user
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!target) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  if (target.status === 'rejected') {
    return NextResponse.json({ error: 'cannot allocate to a rejected user' }, { status: 400 });
  }

  // block accounts open under ANOTHER user
  const takenElsewhere = await prisma.allocation.findMany({
    where: { accountCid: { in: accountCids }, removedAt: null, userId: { not: userId } },
    select: { accountCid: true },
  });
  if (takenElsewhere.length > 0) {
    return NextResponse.json(
      { error: `Allocated to another user: ${takenElsewhere.map(t => t.accountCid).join(', ')}` },
      { status: 409 },
    );
  }

  await prisma.$transaction(async (tx) => {
    const current = await tx.allocation.findMany({
      where: { userId, removedAt: null },
      select: { accountCid: true },
    });
    const currentSet = new Set(current.map(c => c.accountCid));
    const desiredSet = new Set(accountCids);

    // close removed ones
    for (const cid of currentSet) {
      if (!desiredSet.has(cid)) {
        await tx.allocation.updateMany({
          where: { userId, accountCid: cid, removedAt: null },
          data: { removedAt: new Date() },
        });
      }
    }
    // open new ones
    for (const cid of desiredSet) {
      if (!currentSet.has(cid)) {
        await tx.allocation.create({ data: { userId, accountCid: cid } });
      }
    }
  });

  return NextResponse.json({ ok: true });
}