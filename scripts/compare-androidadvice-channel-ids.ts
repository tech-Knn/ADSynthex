// Compares channel_ids returned by AdSense (full form: partner-pub-XXX:NNN) against
// the channel_id values extracted from Google Ads Final URLs for androidadvice
// campaigns. The join will only work if they match exactly.
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

  // AdSense side (today)
  const adsenseRows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const adsenseIds = new Set(adsenseRows.map(r => r.style_id));
  console.log(`AdSense unique channel_ids (today): ${adsenseIds.size}`);
  console.log(`  Samples: ${[...adsenseIds].slice(0, 3).join(', ')}`);

  // Google Ads side — try last 7 days across all androidadvice accounts to find any with ads
  console.log(`\nGoogle Ads scan ${sevenDaysAgo} → ${today} across all androidadvice accounts...`);
  const urlChannelIds = new Set<string>();
  let adsWithUrls = 0;
  let totalAds = 0;
  const sampleUrls: string[] = [];

  for (const acct of AA_ACCOUNT_IDS) {
    try {
      const result: any = await bulletproofAPI.getData(sevenDaysAgo, today, acct, {
        feedType: 'androidadvice' as any,
        allowStale: true,
        priority: 8,
      });
      const ads = result?.data?.ads || [];
      totalAds += ads.length;
      for (const ad of ads) {
        const urls: string[] = ad.final_urls || [];
        if (urls.length) adsWithUrls++;
        for (const u of urls) {
          if (sampleUrls.length < 5) sampleUrls.push(u);
          const cid = extractChannelIdFromUrl(u);
          if (cid) urlChannelIds.add(cid);
        }
      }
      if (ads.length > 0) console.log(`  ${acct}: ${ads.length} ads`);
    } catch (e: any) {
      console.log(`  ${acct}: ERR ${e.message}`);
    }
  }

  console.log(`\nTotal ads fetched: ${totalAds} (with URLs: ${adsWithUrls})`);
  console.log(`Sample URLs:`);
  sampleUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  console.log(`Unique channel_ids extracted from URLs: ${urlChannelIds.size}`);
  console.log(`  Samples: ${[...urlChannelIds].slice(0, 5).join(', ')}`);

  // Intersection
  const matches = [...urlChannelIds].filter(c => adsenseIds.has(c));
  console.log(`\n=== JOIN RESULT ===`);
  console.log(`URL channel_ids matching AdSense channel_ids: ${matches.length}/${urlChannelIds.size}`);
  if (matches.length < urlChannelIds.size) {
    const missed = [...urlChannelIds].filter(c => !adsenseIds.has(c));
    console.log(`Misses (first 5): ${missed.slice(0, 5).join(', ')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
