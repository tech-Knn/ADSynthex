import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { FEED_TO_MCC, registerAccountMCC } from '@/lib/mcc-config';

const DEFAULT_FEED = 'androidadvice';

export async function POST(req: NextRequest) {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;

    let body: { cid?: string; feed?: string } = {};
    try { body = await req.json(); } catch { /* fall through to validation */ }
    const { cid } = body;
    const feed = (body.feed || DEFAULT_FEED).trim();

    if (!cid || !/^\d{10}$/.test(cid)) {
        return NextResponse.json({ error: 'Account must be a 10-digit number' }, { status: 400 });
    }

    const feedRow = await prisma.feed.findUnique({ where: { feedName: feed } });
    if (!feedRow || !feedRow.active) {
        return NextResponse.json({ error: `Unknown or inactive feed "${feed}"` }, { status: 400 });
    }
    const mccKey = FEED_TO_MCC[feed];
    if (!mccKey) {
        return NextResponse.json(
            { error: `Feed "${feed}" has no MCC mapping in FEED_TO_MCC — add it in lib/mcc-config.ts` },
            { status: 500 },
        );
    }

    const existing = await prisma.account.findUnique({ where: { cid } });
    if (existing) {
        return NextResponse.json({ error: 'Account already exists' }, { status: 409 });
    }

    const maxSeq = await prisma.account.aggregate({
        where: { feedName: feed },
        _max: { seq: true },
    });
    const nextSeq = (maxSeq._max.seq ?? 0) + 1;

    await prisma.account.create({
        data: { cid, feedName: feed, active: true, seq: nextSeq },
    });

    // Make the new cid routable in this Node process immediately — other
    // processes pick it up via warmDynamicMccCache on next sync warm-up.
    registerAccountMCC(cid, mccKey);

    return NextResponse.json({ ok: true, cid, seq: nextSeq, feed });
}
