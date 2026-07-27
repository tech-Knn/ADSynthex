import 'dotenv/config';
import { fetchAdSenseRevenueByStyleId, fetchAdSenseDomainEarnings } from '../lib/adsense-api';

async function main() {
  const arg = process.argv.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const d = arg ? new Date(arg) : new Date();
  const date = d.toISOString().slice(0, 10);
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
  if (!publisherId) throw new Error('ANDROIDADVICE_PUBLISHER_ID not set');

  console.log(`AndroidAdvice unattributed revenue check — ${date}\n`);

  // Channel-level revenue (what the account earned, broken down by channel_id)
  const rows = await fetchAdSenseRevenueByStyleId(
    publisherId, date, date, undefined, 'androidadvice'
  );

  // Domain-level earnings (what androidadvices.com earned today)
  const domainEarnings = await fetchAdSenseDomainEarnings(
    publisherId, date, date, undefined, 'androidadvice'
  );

  const channelTotal = rows.reduce((s, r) => s + r.earnings, 0);
  const androidadvicesDomainTotal = domainEarnings['androidadvices.com'] || 0;

  // Aggregate per channel
  const agg: Record<string, { earnings: number; clicks: number; rows: number; countries: Set<string> }> = {};
  for (const r of rows) {
    const id = String(r.style_id);
    if (!agg[id]) agg[id] = { earnings: 0, clicks: 0, rows: 0, countries: new Set() };
    agg[id].earnings += r.earnings;
    agg[id].clicks += r.clicks || 0;
    agg[id].rows += 1;
    if (r.country_name) agg[id].countries.add(r.country_name);
  }

  console.log(`Account-level channel revenue (all channels): $${channelTotal.toFixed(2)}`);
  console.log(`androidadvices.com domain revenue:           $${androidadvicesDomainTotal.toFixed(2)}`);
  console.log(`Other-domain revenue (queryvaults etc.):     $${(channelTotal - androidadvicesDomainTotal).toFixed(2)}`);
  console.log(`\nUnique channels with revenue today: ${Object.keys(agg).length}`);

  console.log(`\nAll domains in this AdSense account today:`);
  for (const [domain, earnings] of Object.entries(domainEarnings).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${domain.padEnd(35)} $${earnings.toFixed(2)}`);
  }

  console.log(`\nTop 20 channels by revenue today:`);
  const sorted = Object.entries(agg).sort((a, b) => b[1].earnings - a[1].earnings).slice(0, 20);
  sorted.forEach(([id, v], i) => {
    console.log(`  ${(i + 1).toString().padStart(2)}. channel_id=${id.padEnd(12)} $${v.earnings.toFixed(2).padStart(8)} | ${v.clicks} clicks | ${[...v.countries].slice(0, 3).join(',')}`);
  });

  console.log(`\nNote: "unattributed" revenue = channels that earned today but aren't`);
  console.log(`mapped to any androidadvice Google Ads campaign. To compute precisely you`);
  console.log(`need to cross-reference with current Google Ads cost URLs. The admin`);
  console.log(`dashboard does this — request /api/adsense-cost-revenue with all`);
  console.log(`androidadvice accountIds and compare returned campaign_aggregated against`);
  console.log(`the totals above.`);
}

main().catch(err => { console.error(err); process.exit(1); });
