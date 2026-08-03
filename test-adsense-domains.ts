import 'dotenv/config';
import { fetchAdSenseDomainEarnings } from './lib/adsense-api';

async function main() {
  const [startDate, endDate] = process.argv.slice(2);
  if (!startDate) {
    console.log('Usage: npx tsx test-adsense-domains.ts 2026-08-02 [endDate]');
    process.exit(1);
  }
  const end = endDate || startDate;
  const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID!;

  console.log(`\nAdSense domain earnings — ${startDate} to ${end}`);
  console.log(`Publisher: ${publisherId}\n`);

  const totals = await fetchAdSenseDomainEarnings(publisherId, startDate, end, undefined, 'androidadvice' as any);

  let grand = 0;
  for (const [domain, earnings] of Object.entries(totals)) {
    console.log(`  ${domain.padEnd(30)} $${Number(earnings).toFixed(2)}`);
    grand += Number(earnings);
  }
  console.log(`  ${'—'.repeat(30)} ${'—'.repeat(10)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} $${grand.toFixed(2)}\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error('Error:', e.message); process.exit(1); });
