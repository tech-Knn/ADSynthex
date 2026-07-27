// Test whether we can pull a channel_id → domain map in one extra call.
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

  // Try combinations that pair CUSTOM_CHANNEL_ID with something that exposes the domain
  const COMBOS = [
    ['CUSTOM_CHANNEL_ID', 'CUSTOM_CHANNEL_NAME'],
    ['CUSTOM_CHANNEL_ID'],
    ['CUSTOM_CHANNEL_NAME'],
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
    console.log(`OK  [${dims.join(', ')}] rows=${j.rows?.length || 0}`);
    (j.rows || []).slice(0, 5).forEach((row: any) => {
      const vals = row.cells.map((c: any) => c?.value || '').join(' | ');
      console.log(`    ${vals}`);
    });
  }

  // Also try the management API to list custom channels with their target domains
  console.log(`\n--- Listing custom channels via Management API ---`);
  // AdSense Management API: list ad clients then channels
  const adClientsUrl = `https://adsense.googleapis.com/v2/${publisherId}/adclients`;
  const acRes = await fetch(adClientsUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!acRes.ok) {
    console.log(`adclients ERR ${acRes.status}: ${(await acRes.text()).slice(0, 200)}`);
    return;
  }
  const acJson: any = await acRes.json();
  for (const ac of (acJson.adClients || []).slice(0, 5)) {
    console.log(`AdClient: name=${ac.name}, productCode=${ac.productCode}, reportingDimensionId=${ac.reportingDimensionId}`);
    // List custom channels for this ad client
    const chUrl = `https://adsense.googleapis.com/v2/${ac.name}/customchannels`;
    const chRes = await fetch(chUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!chRes.ok) {
      console.log(`  customchannels ERR ${chRes.status}: ${(await chRes.text()).slice(0, 200)}`);
      continue;
    }
    const chJson: any = await chRes.json();
    console.log(`  ${(chJson.customChannels || []).length} channels`);
    (chJson.customChannels || []).slice(0, 5).forEach((ch: any) => {
      console.log(`    ${JSON.stringify(ch)}`);
    });
  }
}

main().catch(e => { console.error(e); process.exit(1); });
