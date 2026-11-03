import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // ⚠️ adjust to your prisma client import

const KEY = 'default_launch_setup';

const DEFAULT_SETUP = {
  objective: 'LEADS', goal: 'OUTBOUND_CLICKS', campaignGoal: 'CONVERSIONS', adType: 'IMAGE',
  feed: 'androidadvice', adAccount: null, budget: 5,
  businessName: 'AndroidAdvice', cta: 'LEARN_MORE', conversion: null,
  nameTemplate: '{topic} Demand Gen - {country}', defaultCountry: 'US',
  channels: { ytInStream: false, ytInFeed: false, ytShorts: false, discover: false, gmail: false, display: true, maps: false },
  optimized: true,
};

export async function GET() {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY } }); // ⚠️ field names
    const setup = row?.value ? JSON.parse(row.value) : DEFAULT_SETUP;
    return NextResponse.json({ setup });
  } catch (e: any) {
    console.error('[ad-launcher/setup] GET failed', e?.message);
    return NextResponse.json({ setup: DEFAULT_SETUP });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = JSON.stringify(body);
    await prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value },
      create: { key: KEY, value },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[ad-launcher/setup] POST failed', e?.message);
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
}