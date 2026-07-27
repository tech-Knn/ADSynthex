// Probes valid AdSense dimension combinations for androidadvice (CUSTOM_CHANNEL_ID).
// Try several dimension sets to find one the API accepts.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';

const COMBOS: string[][] = [
  ['DATE', 'CUSTOM_CHANNEL_ID'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'COUNTRY_NAME'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'DOMAIN_NAME'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'COUNTRY_NAME', 'DOMAIN_NAME'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'CUSTOM_SEARCH_STYLE_ID'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'COUNTRY_CODE'],
  ['DATE', 'CUSTOM_CHANNEL_ID', 'COUNTRY_CODE', 'DOMAIN_NAME'],
];

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
    url.searchParams.append('metrics', 'IMPRESSIONS');
    url.searchParams.append('metrics', 'CLICKS');
    for (const dim of dims) url.searchParams.append('dimensions', dim);

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const j: any = await r.json();
      const total = (j.rows || []).reduce((s: number, row: any) => s + parseFloat(row.cells[dims.length]?.value || '0'), 0);
      console.log(`OK  [${dims.join(', ')}] rows=${j.rows?.length || 0} earnings=$${total.toFixed(2)}`);
    } else {
      const errText = await r.text();
      const errMsg = errText.match(/"message":\s*"([^"]+)"/)?.[1] || errText.slice(0, 100);
      console.log(`ERR [${dims.join(', ')}] ${errMsg}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
