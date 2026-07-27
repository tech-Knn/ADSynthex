// Pulls every channel_id that has ever been embedded in a Final URL across all 18
// androidadvice Google Ads accounts, over a wide date range. This is the true
// "androidadvice channel set" from the cost side.
import 'dotenv/config';
import { extractChannelIdFromUrl, fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';
import { bulletproofAPI } from '../lib/bulletproof-google-ads-api';

const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

async function main() {
  // 90-day window — wide enough to catch any campaign that ran recently
  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  console.log(`Scanning Google Ads ads ${ninetyAgo} → ${today} across ${AA_ACCOUNT_IDS.length} accounts...`);

  const channelToAccounts = new Map<string, Set<string>>();
  let totalAds = 0;
  let adsWithChannel = 0;
  let adsWithUrls = 0;
  const accountAdCounts: Record<string, number> = {};

  for (const acct of AA_ACCOUNT_IDS) {
    try {
      const r: any = await bulletproofAPI.getData(ninetyAgo, today, acct, {
        feedType: 'androidadvice' as any,
        allowStale: true,
        priority: 8,
      });
      const ads = r?.data?.ads || [];
      accountAdCounts[acct] = ads.length;
      totalAds += ads.length;
      for (const ad of ads) {
        const urls: string[] = ad.final_urls || [];
        if (urls.length) adsWithUrls++;
        let foundChannel = false;
        for (const u of urls) {
          const cid = extractChannelIdFromUrl(u);
          if (cid) {
            foundChannel = true;
            if (!channelToAccounts.has(cid)) channelToAccounts.set(cid, new Set());
            channelToAccounts.get(cid)!.add(acct);
          }
        }
        if (foundChannel) adsWithChannel++;
      }
    } catch (e: any) {
      console.log(`  ${acct}: ERR ${e.message}`);
    }
  }

  console.log(`\n=== ACCOUNT SCAN ===`);
  for (const [acct, n] of Object.entries(accountAdCounts).sort((a, b) => b[1] - a[1])) {
    if (n > 0) console.log(`  ${acct}: ${n} ads`);
  }
  const zero = Object.entries(accountAdCounts).filter(([, n]) => n === 0).map(([a]) => a);
  if (zero.length) console.log(`  (${zero.length} accounts had 0 ads in window: ${zero.join(', ')})`);

  console.log(`\nTotal ads: ${totalAds}`);
  console.log(`Ads with Final URLs: ${adsWithUrls}`);
  console.log(`Ads with extractable channel_id: ${adsWithChannel}`);
  console.log(`\n=== UNIQUE ANDROIDADVICE channel_ids: ${channelToAccounts.size} ===`);

  // Today's earnings per channel
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;
  const rows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const earningsToday = new Map<string, number>();
  for (const r of rows) {
    earningsToday.set(r.style_id, (earningsToday.get(r.style_id) || 0) + r.earnings);
  }

  // Report each androidadvice channel
  const entries = [...channelToAccounts.entries()].sort((a, b) => (earningsToday.get(b[0]) || 0) - (earningsToday.get(a[0]) || 0));
  let totalAttributed = 0;
  for (const [cid, accts] of entries) {
    const e = earningsToday.get(cid) || 0;
    totalAttributed += e;
    console.log(`  ${cid}  earnings_today=$${e.toFixed(2)}  in_accounts=${accts.size}`);
  }
  console.log(`\nTotal attributed to androidadvice channel set today: $${totalAttributed.toFixed(2)}`);
  console.log(`(Compare to androidadvices.com domain total today: query domain breakdown for truth)`);
}

main().catch(e => { console.error(e); process.exit(1); });
