import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;

    const { cid } = await req.json();
    if (!cid || !/^\d{10}$/.test(cid)) {
        return NextResponse.json({ error: 'Account must be a 10-digit number' }, { status: 400 });
    }

    const existing = await prisma.account.findUnique({ where: { cid } });
    if (existing) {
        return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    const maxSeq = await prisma.account.aggregate({
        where: { feedName: 'androidadvice' },
        _max: { seq: true },
    });
    const nextSeq = (maxSeq._max.seq ?? 0) + 1;

    await prisma.account.create({
        data: { cid, feedName: 'androidadvice', active: true, seq: nextSeq },
    });

    return NextResponse.json({ ok: true, cid, seq: nextSeq });
}