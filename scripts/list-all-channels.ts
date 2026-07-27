// Pulls the full picture from the AdSense Management API for the androidadvice
// publisher: all ad clients, all custom channels (paginated), all URL channels,
// and the detail view of one channel so we can see every available field.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';

async function authedFetch(token: string, url: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}: ${(await r.text()).slice(0, 200)}`);
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
  if (!token) throw new Error('no token');

  // 1) List ad clients
  console.log('=== AD CLIENTS ===');
  const ac = await authedFetch(token, `https://adsense.googleapis.com/v2/${publisherId}/adclients`);
  const clients = ac.adClients || [];
  for (const c of clients) {
    console.log(`  ${c.name}  productCode=${c.productCode}  rdid=${c.reportingDimensionId}`);
  }

  // Find the AFS adclient (where the partner-pub-XXX:NNN channels live)
  const afs = clients.find((c: any) => c.productCode === 'AFS') || clients.find((c: any) => c.name.includes('partner-pub'));
  if (!afs) { console.log('No AFS adclient found'); return; }
  console.log(`\n=== AFS ADCLIENT: ${afs.name} ===\n`);

  // 2) Paginate all custom channels
  console.log('=== CUSTOM CHANNELS (paginated) ===');
  const custom = await paginate(token, `https://adsense.googleapis.com/v2/${afs.name}/customchannels`, 'customChannels');
  console.log(`Total custom channels: ${custom.length}`);
  console.log('Sample 3 (raw):');
  custom.slice(0, 3).forEach(c => console.log('  ', JSON.stringify(c)));
  const fields = new Set<string>();
  custom.forEach(c => Object.keys(c).forEach(k => fields.add(k)));
  console.log(`Fields seen across all channels: ${[...fields].join(', ')}`);

  // 3) Detail view of one channel — sometimes the get endpoint returns more
  if (custom.length > 0) {
    console.log('\n=== CHANNEL DETAIL (.get) ===');
    try {
      const detail = await authedFetch(token, `https://adsense.googleapis.com/v2/${custom[0].name}`);
      console.log(JSON.stringify(detail, null, 2));
    } catch (e: any) {
      console.log('detail fetch failed:', e.message);
    }
  }

  // 4) URL channels (these ARE tied to URLs/domains)
  console.log('\n=== URL CHANNELS ===');
  try {
    const urlCh = await paginate(token, `https://adsense.googleapis.com/v2/${afs.name}/urlchannels`, 'urlChannels');
    console.log(`Total URL channels: ${urlCh.length}`);
    urlCh.slice(0, 10).forEach(u => console.log('  ', JSON.stringify(u)));
  } catch (e: any) {
    console.log('urlchannels failed:', e.message);
  }

  // 5) Sites — newer AdSense API surface
  console.log('\n=== SITES ===');
  try {
    const sites = await authedFetch(token, `https://adsense.googleapis.com/v2/${publisherId}/sites?pageSize=200`);
    console.log(`Total sites: ${(sites.sites || []).length}`);
    (sites.sites || []).slice(0, 20).forEach((s: any) => console.log('  ', JSON.stringify(s)));
  } catch (e: any) {
    console.log('sites failed:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
