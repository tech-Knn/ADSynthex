// Strip the partner-pub-XXX: prefix from AdSense channel_ids and check overlap
// with the bare channel_ids extracted from androidadvice Google Ads Final URLs.
import 'dotenv/config';
import { fetchAdSenseRevenueByStyleId, extractChannelIdFromUrl } from '../lib/adsense-api';
import { bulletproofAPI } from '../lib/bulletproof-google-ads-api';

const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

const stripPrefix = (id: string) => id.includes(':') ? id.split(':').pop()! : id;

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;

  const adsenseRows = await fetchAdSenseRevenueByStyleId(publisherId, today, today, undefined, 'androidadvice');
  const adsenseFull = new Set(adsenseRows.map(r => r.style_id));
  const adsenseBare = new Set(adsenseRows.map(r => stripPrefix(r.style_id)));
  console.log(`AdSense rows: ${adsenseRows.length}`);
  console.log(`Unique full-form channel_ids: ${adsenseFull.size}`);
  console.log(`Unique bare channel_ids (after strip): ${adsenseBare.size}`);
  console.log(`Sample bare ids: ${[...adsenseBare].slice(0, 5).join(', ')}`);

  // Collect Google Ads URL channel_ids
  const urlIds = new Set<string>();
  for (const acct of AA_ACCOUNT_IDS) {
    try {
      const r: any = await bulletproofAPI.getData(sevenDaysAgo, today, acct, {
        feedType: 'androidadvice' as any, allowStale: true, priority: 8,
      });
      for (const ad of r?.data?.ads || []) {
        for (const u of ad.final_urls || []) {
          const cid = extractChannelIdFromUrl(u);
          if (cid) urlIds.add(cid);
        }
      }
    } catch {}
  }
  console.log(`\nUnique URL channel_ids: ${urlIds.size}`);
  console.log(`Sample URL ids: ${[...urlIds].slice(0, 5).join(', ')}`);

  const matchBare = [...urlIds].filter(c => adsenseBare.has(c));
  const matchFull = [...urlIds].filter(c => adsenseFull.has(c));
  console.log(`\nMatches against full-form AdSense ids: ${matchFull.length}/${urlIds.size}`);
  console.log(`Matches against bare AdSense ids (after strip): ${matchBare.length}/${urlIds.size}`);
  if (matchBare.length > 0) {
    console.log(`Matching ids (first 5): ${matchBare.slice(0, 5).join(', ')}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
