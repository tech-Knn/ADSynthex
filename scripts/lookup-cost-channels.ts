// Cross-reference: are our 6 cost-URL channel_ids registered as custom channels
// in AdSense? And what's the rough proportion of all 2000 AdSense channels that
// have AdSense earnings vs. our 6 active ones?
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';

const URL_CHANNEL_IDS = [
  '3823835139', '2510753463', '1417163643',
  '6609874131', '1197671791', '8884590124',
];

async function authedFetch(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as any;
}

async function paginate(token: string, baseUrl: string, key: string): Promise<any[]> {
  const all: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const u = new URL(baseUrl);
    u.searchParams.set('pageSize', '500');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const j = await authedFetch(token, u.toString());
    all.push(...(j[key] || []));
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return all;
}

async function main() {
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;
  const client = new OAuth2Client({
    clientId: process.env.ANDROIDADVICE_ADSENSE_CLIENT_ID,
    clientSecret: process.env.ANDROIDADVICE_ADSENSE_CLIENT_SECRET,
  });
  client.setCredentials({ refresh_token: process.env.ANDROIDADVICE_ADSENSE_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();

  // Pull all 2000 AdSense custom channels (AFS)
  const afsAdClient = `${publisherId}/adclients/partner-pub-${publisherId.split('-')[1]}`;
  const allChannels = await paginate(
    token!,
    `https://adsense.googleapis.com/v2/${afsAdClient}/customchannels`,
    'customChannels'
  );
  const adsenseIds = new Map<string, any>();
  for (const ch of allChannels) {
    const tail = ch.reportingDimensionId.split(':').pop();
    adsenseIds.set(tail, ch);
  }
  console.log(`AdSense AFS custom channels (total registered): ${adsenseIds.size}`);

  // Pull today's per-channel earnings
  const today = new Date().toISOString().slice(0, 10);
  const rows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const earningsById = new Map<string, number>();
  for (const r of rows) {
    earningsById.set(r.style_id, (earningsById.get(r.style_id) || 0) + r.earnings);
  }
  const earningChannels = [...earningsById.entries()].filter(([, v]) => v > 0);
  console.log(`AdSense channels with earnings today: ${earningChannels.length} (sum across all domains: $${earningChannels.reduce((s, [, v]) => s + v, 0).toFixed(2)})`);

  // Cross-reference our 6 URL channel_ids
  console.log(`\n=== YOUR 6 COST-URL CHANNEL_IDS ===`);
  for (const cid of URL_CHANNEL_IDS) {
    const ch = adsenseIds.get(cid);
    const earn = earningsById.get(cid) || 0;
    console.log(
      `  ${cid}: ` +
      (ch ? `registered (displayName="${ch.displayName}", active=${ch.active})` : `NOT registered in AdSense`) +
      ` | earnings today: $${earn.toFixed(2)}`
    );
  }

  // Sample 5 channels that DID earn today but aren't in our URL set (these are the
  // gap channels — earning on the publisher but no Google Ads campaign of ours points
  // at them). They could be androidadvices.com OR queryvaults.com — we cannot tell.
  console.log(`\n=== TOP 10 EARNING CHANNELS NOT IN YOUR URL SET ===`);
  const notInUrls = earningChannels
    .filter(([id]) => !URL_CHANNEL_IDS.includes(id))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  for (const [id, earn] of notInUrls) {
    const ch = adsenseIds.get(id);
    console.log(`  ${id}: $${earn.toFixed(2)}  displayName="${ch?.displayName || '?'}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
