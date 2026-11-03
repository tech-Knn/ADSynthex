import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; 

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<{ geo_id: string; country_code: string }[]>`
      SELECT geo_id, country_code FROM geo_countries ORDER BY country_code
    `;
    const countries = rows.map((r) => ({ geoId: String(r.geo_id), code: r.country_code }));
    return NextResponse.json({ countries });
  } catch (e: any) {
    console.error('[ad-launcher/countries] failed', e?.message);
    return NextResponse.json({ countries: [] });
  }
}