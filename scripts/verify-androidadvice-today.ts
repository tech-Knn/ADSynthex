// Verifies that the new CUSTOM_CHANNEL_ID dimension returns today's revenue for
// androidadvice. Run with: npx tsx scripts/verify-androidadvice-today.ts
import 'dotenv/config';
import { fetchAdSenseRevenueByStyleId } from '../lib/adsense-api';

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
  if (!publisherId) throw new Error('ANDROIDADVICE_PUBLISHER_ID not set');

  console.log(`Fetching androidadvice revenue for ${today} (channel_id dimension)`);
  const rows = await fetchAdSenseRevenueByStyleId(
    publisherId,
    today,
    today,
    undefined,
    'androidadvice'
  );

  const totalEarnings = rows.reduce((s, r) => s + r.earnings, 0);
  const uniqueIds = new Set(rows.map(r => r.style_id));
  const uniqueDomains = new Set(rows.map(r => r.domain_name).filter(Boolean));

  console.log(`Rows: ${rows.length}`);
  console.log(`Total earnings today: $${totalEarnings.toFixed(2)}`);
  console.log(`Unique channel_ids (stored as style_id field): ${uniqueIds.size}`);
  console.log(`Unique domains: ${uniqueDomains.size} (${[...uniqueDomains].join(', ')})`);
  console.log('\nFirst 5 rows:');
  rows.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i + 1}. channel_id=${r.style_id} domain=${r.domain_name} country=${r.country_name} earnings=$${r.earnings.toFixed(2)}`);
  });
}

main().catch(err => { console.error(err); process.exit(1); });
