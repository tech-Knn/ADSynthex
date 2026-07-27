// End-to-end check: pull androidadvice cost-side channel_ids, then sum AdSense
// per-channel earnings restricted to that set. Should land near $58.95
// (the androidadvices.com total reported by DOMAIN_NAME breakdown).
import 'dotenv/config';
import { fetchAdSenseRevenueByStyleId, extractChannelIdFromUrl } from '../lib/adsense-api';
import { bulletproofAPI } from '../lib/bulletproof-google-ads-api';

const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;

  // AdSense per-channel revenue for today (all domains under this publisher)
  const adsenseRows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const adsenseEarnings = new Map<string, number>();
  for (const r of adsenseRows) {
    adsenseEarnings.set(r.style_id, (adsenseEarnings.get(r.style_id) || 0) + r.earnings);
  }
  const totalAdsense = [...adsenseEarnings.values()].reduce((s, v) => s + v, 0);
  console.log(`AdSense per-channel rows: ${adsenseRows.length} (${adsenseEarnings.size} unique channels)`);
  console.log(`AdSense cross-domain total: $${totalAdsense.toFixed(2)}`);

  // Cost-side channel_ids from all androidadvice accounts (last 7 days for stability)
  const aaChannelIds = new Set<string>();
  for (const acct of AA_ACCOUNT_IDS) {
    try {
      const r: any = await bulletproofAPI.getData(sevenDaysAgo, today, acct, {
        feedType: 'androidadvice' as any, allowStale: true, priority: 8,
      });
      for (const ad of r?.data?.ads || []) {
        for (const u of ad.final_urls || []) {
          const cid = extractChannelIdFromUrl(u);
          if (cid) aaChannelIds.add(cid);
        }
      }
    } catch {}
  }
  console.log(`\nAndroidadvice cost-URL channel_ids: ${aaChannelIds.size}`);

  // Sum AdSense earnings restricted to androidadvice channels
  let androidadviceTotal = 0;
  let matchedChannels = 0;
  for (const cid of aaChannelIds) {
    const earn = adsenseEarnings.get(cid);
    if (earn !== undefined) {
      androidadviceTotal += earn;
      matchedChannels++;
    }
  }
  console.log(`Matched ${matchedChannels}/${aaChannelIds.size} channel_ids with AdSense data`);
  console.log(`\n=== ANDROIDADVICE REVENUE TODAY: $${androidadviceTotal.toFixed(2)} ===`);
  console.log(`(domain breakdown said androidadvices.com = $58.95)`);
}

main().catch(e => { console.error(e); process.exit(1); });
