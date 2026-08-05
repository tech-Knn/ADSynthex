import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function GET() {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;

    const accounts = await prisma.account.findMany({
        where: { feedName: 'androidadvice' },
        select: { cid: true, seq: true },
        orderBy: { seq: 'asc' },
    });
    return NextResponse.json({ accounts });
}