// More dimension combos that pair DOMAIN_NAME with a channel column.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';

async function main() {
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;
  const client = new OAuth2Client({
    clientId: process.env.ANDROIDADVICE_ADSENSE_CLIENT_ID,
    clientSecret: process.env.ANDROIDADVICE_ADSENSE_CLIENT_SECRET,
  });
  client.setCredentials({ refresh_token: process.env.ANDROIDADVICE_ADSENSE_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();

  const today = new Date().toISOString().slice(0, 10);
  const [y, m, d] = today.split('-');

  const COMBOS: string[][] = [
    ['DOMAIN_NAME'],
    ['CUSTOM_CHANNEL_ID', 'DOMAIN_NAME'],      // 2 dims, no DATE
    ['CUSTOM_CHANNEL_NAME', 'DOMAIN_NAME'],    // 2 dims, no DATE
    ['DOMAIN_NAME', 'CUSTOM_CHANNEL_NAME'],    // reverse order
    ['DATE', 'DOMAIN_NAME', 'CUSTOM_CHANNEL_NAME'],
    ['DOMAIN_NAME', 'CUSTOM_SEARCH_STYLE_ID'],
    ['DOMAIN_NAME', 'CUSTOM_SEARCH_STYLE_ID', 'CUSTOM_CHANNEL_NAME'],
  ];

  for (const dims of COMBOS) {
    const url = new URL(`https://adsense.googleapis.com/v2/${publisherId}/reports:generate`);
    url.searchParams.set('dateRange', 'CUSTOM');
    url.searchParams.set('startDate.year', y);
    url.searchParams.set('startDate.month', m);
    url.searchParams.set('startDate.day', d);
    url.searchParams.set('endDate.year', y);
    url.searchParams.set('endDate.month', m);
    url.searchParams.set('endDate.day', d);
    url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
    for (const dim of dims) url.searchParams.append('dimensions', dim);

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const err = await r.text();
      const msg = err.match(/"message":\s*"([^"]+)"/)?.[1] || err.slice(0, 80);
      console.log(`ERR [${dims.join(', ')}] ${msg}`);
      continue;
    }
    const j: any = await r.json();
    let total = 0;
    let aaTotal = 0;
    for (const row of j.rows || []) {
      const cells = row.cells;
      const earn = parseFloat(cells[dims.length]?.value || '0');
      total += earn;
      const hasAA = cells.some((c: any) => (c?.value || '').toLowerCase().includes('androidadvices'));
      if (hasAA) aaTotal += earn;
    }
    console.log(`OK  [${dims.join(', ')}] rows=${j.rows?.length || 0} total=$${total.toFixed(2)} androidadvices_only=$${aaTotal.toFixed(2)}`);
    (j.rows || []).slice(0, 3).forEach((row: any) => {
      console.log(`    ${row.cells.map((c: any) => c?.value || '').join(' | ')}`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
