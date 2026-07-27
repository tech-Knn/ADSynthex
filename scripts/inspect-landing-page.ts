// Find a Final URL from the androidadvice campaigns that uses channel_id=6286346946,
// fetch that page, and search the HTML for what `channel` value the AdSense search
// box is actually wired with. The mismatch between URL channel_id (cost side) and
// search-box channel (revenue side) is the root cause when conversions exist but
// AdSense channel earns $0.
import 'dotenv/config';
import { extractChannelIdFromUrl } from '../lib/adsense-api';
import { bulletproofAPI } from '../lib/bulletproof-google-ads-api';

const TARGET_CHANNEL = '6286346946';
const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  // Find Final URLs that contain channel_id=6286346946
  const matchingUrls = new Set<string>();
  for (const acct of AA_ACCOUNT_IDS) {
    try {
      const r: any = await bulletproofAPI.getData(ninetyAgo, today, acct, {
        feedType: 'androidadvice' as any, allowStale: true, priority: 8,
      });
      for (const ad of r?.data?.ads || []) {
        for (const u of ad.final_urls || []) {
          if (extractChannelIdFromUrl(u) === TARGET_CHANNEL) matchingUrls.add(u);
        }
      }
    } catch {}
    if (matchingUrls.size >= 3) break;
  }

  console.log(`Found ${matchingUrls.size} Final URLs using channel_id=${TARGET_CHANNEL}`);
  if (matchingUrls.size === 0) return;

  // Fetch the first URL and scan the HTML for the actual AdSense channel attribute
  const sampleUrl = [...matchingUrls][0];
  console.log(`\n--- FULL ORIGINAL URL ---`);
  console.log(sampleUrl);
  console.log(`\n--- Query params parsed ---`);
  try {
    const u = new URL(sampleUrl);
    for (const [k, v] of u.searchParams.entries()) {
      const display = v.length > 60 ? v.slice(0, 60) + '…' : v;
      console.log(`  ${k} = ${display}`);
    }
  } catch (e: any) {
    console.log(`  (URL parse error: ${e.message})`);
  }

  console.log(`\n--- Fetching ---`);
  const res = await fetch(sampleUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    },
  });
  console.log(`Status: ${res.status}`);
  console.log(`Final URL after redirects: ${res.url}`);
  // Did the redirect strip the query?
  try {
    const finalU = new URL(res.url);
    const finalChannel = finalU.searchParams.get('channel_id');
    console.log(`Channel_id surviving in final URL: ${finalChannel || '(LOST IN REDIRECT)'}`);
  } catch {}
  const html = await res.text();
  console.log(`HTML length: ${html.length}`);

  // Look for AdSense channel hints
  console.log(`\n=== Channel attribute matches in HTML ===`);
  const patterns = [
    { name: 'channel="..."',           re: /channel\s*=\s*["']([^"']+)["']/gi },
    { name: 'channel: "..."',          re: /\bchannel\s*[:=]\s*["']([^"']+)["']/gi },
    { name: 'adChannel: "..."',        re: /\badChannel\s*[:=]\s*["']([^"']+)["']/gi },
    { name: 'data-ad-channel="..."',   re: /data-ad-channel\s*=\s*["']([^"']+)["']/gi },
    { name: 'adsense.*channel param',  re: /(?:google_ad_channel|google_adChannel|google-ad-channel)\s*=\s*["']?([\w\d:-]+)/gi },
  ];
  const found = new Set<string>();
  for (const { name, re } of patterns) {
    let m: RegExpExecArray | null;
    let n = 0;
    while ((m = re.exec(html)) && n < 5) {
      const v = m[1];
      console.log(`  ${name}: "${v}"`);
      found.add(v);
      n++;
    }
  }

  // Did we find our target channel in the page?
  console.log(`\n=== VERDICT ===`);
  if (found.has(TARGET_CHANNEL) || [...found].some(v => v.endsWith(`:${TARGET_CHANNEL}`))) {
    console.log(`✓ Channel ${TARGET_CHANNEL} IS embedded in this page's AdSense code.`);
    console.log(`  → Revenue gap is NOT a mismatch. Likely cause: users land but don't search,`);
    console.log(`    or the search returns no monetizable ads.`);
  } else {
    console.log(`✗ Channel ${TARGET_CHANNEL} is NOT in this page's AdSense code.`);
    console.log(`  Channels actually embedded: ${[...found].slice(0, 10).join(', ') || 'none found'}`);
    console.log(`  → This is the bug. The URL tags ${TARGET_CHANNEL} but the search box reports`);
    console.log(`    to one of the channels listed above instead. Whatever AdSense revenue these`);
    console.log(`    174 clicks generated, it went there — not to ${TARGET_CHANNEL}.`);
  }

  // Also surface RSOC / search box hints
  const hasSearchBox = /gcse|google\.search\.cse|cse\.google\.com|searchbox|RSoC/i.test(html);
  console.log(`\nSearch box / RSOC code detected in HTML: ${hasSearchBox ? 'YES' : 'NO'}`);

  // Show every chunk of HTML that mentions channel_id / style_id / cse / pubid /
  // the target channel — gives us the real story of how the page uses URL params.
  console.log(`\n=== Snippets referencing channel/style/cse/${TARGET_CHANNEL} ===`);
  const needles = ['channel_id', 'style_id', 'cse_token', 'cseToken', 'partner-pub', 'pubid', 'pubId', 'channelid', 'channelId', 'rsoCh', 'rsoChn', TARGET_CHANNEL, 'customsearch', 'adsbygoogle'];
  for (const needle of needles) {
    let idx = 0;
    let hits = 0;
    while ((idx = html.toLowerCase().indexOf(needle.toLowerCase(), idx)) !== -1 && hits < 2) {
      const slice = html.slice(Math.max(0, idx - 60), idx + 200).replace(/\s+/g, ' ');
      console.log(`  [${needle}] ...${slice}...`);
      idx += needle.length;
      hits++;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
