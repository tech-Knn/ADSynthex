import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(
    req: NextRequest,
    { params }: { params: { userId: string } },
) {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;

    const { userId } = params;
    const { accountCids } = await req.json(); // string[] of accounts to allocate

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });
    if (user.status !== 'pending') {
        return NextResponse.json({ error: 'user is not pending' }, { status: 400 });
    }

    if (Array.isArray(accountCids) && accountCids.length > 0) {
        const taken = await prisma.allocation.findMany({
            where: { accountCid: { in: accountCids }, removedAt: null },
            select: { accountCid: true },
        });
        if (taken.length > 0) {
            return NextResponse.json(
                { error: `Account(s) already allocated: ${taken.map(t => t.accountCid).join(', ')}. Reassign from the user's profile instead.` },
                { status: 409 },
            );
        }
    }

    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: userId },
            data: { status: 'active', approvedAt: new Date() },
        });
        if (Array.isArray(accountCids) && accountCids.length > 0) {
            for (const cid of accountCids) {
                await tx.allocation.create({ data: { userId, accountCid: cid } });
            }
        }
    });

    return NextResponse.json({ ok: true });
}