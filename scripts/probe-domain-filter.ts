// Test the AdSense `filters` query param: keep CUSTOM_CHANNEL_ID as a dimension
// but restrict to a specific DOMAIN_NAME. If this works the join becomes trivial:
// (androidadvices.com revenue) per channel_id.
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

  const FILTERS = [
    'DOMAIN_NAME==androidadvices.com',
    'DOMAIN_NAME=="androidadvices.com"',
  ];

  for (const filter of FILTERS) {
    const url = new URL(`https://adsense.googleapis.com/v2/${publisherId}/reports:generate`);
    url.searchParams.set('dateRange', 'CUSTOM');
    url.searchParams.set('startDate.year', y);
    url.searchParams.set('startDate.month', m);
    url.searchParams.set('startDate.day', d);
    url.searchParams.set('endDate.year', y);
    url.searchParams.set('endDate.month', m);
    url.searchParams.set('endDate.day', d);
    url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
    url.searchParams.append('metrics', 'IMPRESSIONS');
    url.searchParams.append('metrics', 'CLICKS');
    url.searchParams.append('dimensions', 'DATE');
    url.searchParams.append('dimensions', 'CUSTOM_CHANNEL_ID');
    url.searchParams.append('dimensions', 'COUNTRY_NAME');
    url.searchParams.append('filters', filter);

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const err = await r.text();
      const msg = err.match(/"message":\s*"([^"]+)"/)?.[1] || err.slice(0, 100);
      console.log(`ERR filter=${filter}: ${msg}`);
      continue;
    }
    const j: any = await r.json();
    let total = 0;
    for (const row of j.rows || []) {
      total += parseFloat(row.cells[3]?.value || '0');
    }
    console.log(`OK  filter=${filter}: rows=${j.rows?.length || 0} total=$${total.toFixed(2)}`);
    (j.rows || []).slice(0, 3).forEach((row: any) => {
      console.log(`    ${row.cells.map((c: any) => c?.value || '').join(' | ')}`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
