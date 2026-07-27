// Deep-dive on channel 6286346946 — why are there cost-side conversions but
// no AdSense revenue today? Check 30-day earnings history and confirm it's
// registered on AdSense.
import 'dotenv/config';
import { OAuth2Client } from 'google-auth-library';
import { fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';

const TARGET = '6286346946';

async function main() {
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;
  const client = new OAuth2Client({
    clientId: process.env.ANDROIDADVICE_ADSENSE_CLIENT_ID,
    clientSecret: process.env.ANDROIDADVICE_ADSENSE_CLIENT_SECRET,
  });
  client.setCredentials({ refresh_token: process.env.ANDROIDADVICE_ADSENSE_REFRESH_TOKEN });
  const { token } = await client.getAccessToken();

  // 1) Confirm registered in AdSense
  console.log(`=== AdSense channel registration for ${TARGET} ===`);
  const chRes = await fetch(
    `https://adsense.googleapis.com/v2/${publisherId}/adclients/partner-pub-5666608633267855/customchannels/${TARGET}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (chRes.ok) {
    console.log(JSON.stringify(await chRes.json(), null, 2));
  } else {
    console.log('NOT REGISTERED (status', chRes.status, ')');
  }

  // 2) 30-day earnings broken out by day for this specific channel
  console.log(`\n=== Last 30 days earnings for ${TARGET} ===`);
  const today = new Date();
  const thirtyAgo = new Date(today.getTime() - 30 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const rows = await fetchAdSenseRevenueByStyleId(
    publisherId, fmt(thirtyAgo), fmt(today), undefined, 'androidadvice'
  );
  const byDate = new Map<string, { earn: number; imp: number; clk: number }>();
  for (const r of rows) {
    if (r.style_id !== TARGET) continue;
    const v = byDate.get(r.date) || { earn: 0, imp: 0, clk: 0 };
    v.earn += r.earnings;
    v.imp += r.impressions;
    v.clk += r.clicks;
    byDate.set(r.date, v);
  }
  if (byDate.size === 0) {
    console.log(`  No AdSense activity for ${TARGET} in last 30 days.`);
  } else {
    let totalE = 0, totalI = 0, totalC = 0;
    [...byDate.entries()].sort().forEach(([date, v]) => {
      console.log(`  ${date}  earnings=$${v.earn.toFixed(2)}  impressions=${v.imp}  clicks=${v.clk}`);
      totalE += v.earn; totalI += v.imp; totalC += v.clk;
    });
    console.log(`  TOTAL 30d:  $${totalE.toFixed(2)}, ${totalI} impressions, ${totalC} clicks`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
