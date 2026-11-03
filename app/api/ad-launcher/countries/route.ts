import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ geo_id: string; country_code: string }[]>`
      SELECT geo_id, country_code FROM geo_countries ORDER BY country_code
    `;
    const countries = rows.map((r) => ({ geoId: String(r.geo_id), code: r.country_code }));
    return NextResponse.json({ countries });
  } catch (e: any) {
    console.error('[ad-launcher/countries] failed:', e?.message || e);
    // TEMP: expose the error so we can see why live returns empty
    return NextResponse.json({ countries: [], error: e?.message || String(e) }, { status: 500 });
  }
}