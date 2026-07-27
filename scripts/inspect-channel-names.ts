// Compare displayName patterns: 27 known androidadvice channels vs. top
// earners not in that set. If androidadvice uses a distinct naming convention
// (e.g. a number range), we can filter AdSense by it.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';

const ANDROIDADVICE_CHANNELS = new Set([
  '8884590124','1197671791','3823835139','2510753463','3147882093','8617623203',
  '8073385570','9386467247','6609874131','4460963764','1319795101','2132105908',
  '2730245314','4043326984','5447222235','6286346946','8320797584','4973265277',
  '9989102471','2302184148','7362939139','8676020801','1772386865','3445187572',
  '7407856928','1034020262','8720938595',
]);

async function authedFetch(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as any;
}

async function paginate(token: string, baseUrl: string, key: string): Promise<any[]> {
  const all: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 50; i++) {
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

  const allChannels = await paginate(
    token!,
    `https://adsense.googleapis.com/v2/${publisherId}/adclients/partner-pub-5666608633267855/customchannels`,
    'customChannels'
  );
  const byId = new Map<string, any>();
  for (const ch of allChannels) byId.set(ch.reportingDimensionId.split(':').pop(), ch);

  console.log('=== ANDROIDADVICE CHANNEL displayNames (from cost URLs) ===');
  const aaNames: string[] = [];
  for (const cid of ANDROIDADVICE_CHANNELS) {
    const ch = byId.get(cid);
    if (ch) aaNames.push(ch.displayName);
    console.log(`  ${cid}  → displayName="${ch?.displayName ?? 'NOT REGISTERED'}"  active=${ch?.active ?? '-'}`);
  }
  console.log(`\nDistinct androidadvice displayNames: ${[...new Set(aaNames)].sort().join(', ')}`);

  // Today's earnings — top 20 channels NOT in androidadvice set
  const today = new Date().toISOString().slice(0, 10);
  const rows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const earnById = new Map<string, number>();
  for (const r of rows) earnById.set(r.style_id, (earnById.get(r.style_id) || 0) + r.earnings);

  const others = [...earnById.entries()]
    .filter(([id, v]) => v > 0 && !ANDROIDADVICE_CHANNELS.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log('\n=== TOP 20 EARNING CHANNELS NOT IN ANDROIDADVICE SET ===');
  for (const [id, earn] of others) {
    const ch = byId.get(id);
    console.log(`  ${id}  $${earn.toFixed(2)}  displayName="${ch?.displayName ?? '?'}"  active=${ch?.active ?? '-'}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
