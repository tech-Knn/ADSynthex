/**
 * Manual sync runner (terminal).
 *
 * Usage:
 *   npx tsx scripts/run-sync.ts bootstrap
 *   npx tsx scripts/run-sync.ts 2026-07-29 2026-07-31
 *   npx tsx scripts/run-sync.ts 2026-07-29 2026-07-31 4702286319
 */

import 'dotenv/config';
import { syncRange, bootstrapAccounts } from '../lib/sync';
import { prisma } from '../lib/prisma';

// The 19 AndroidAdvice accounts, currently hardcoded in the app.
// `bootstrap` copies them into Postgres — after that the sync reads them
// from the DB, and adding/removing an account is a DB change, not a code change.
const AA_ACCOUNTS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647', '9722524142',
];

async function main() {
  const [arg1, arg2, arg3] = process.argv.slice(2);

  if (!arg1) {
    console.log(`
Usage:
  npx tsx scripts/run-sync.ts bootstrap
  npx tsx scripts/run-sync.ts <startDate> <endDate> [accountId]

Examples:
  npx tsx scripts/run-sync.ts bootstrap
  npx tsx scripts/run-sync.ts 2026-07-31 2026-07-31
  npx tsx scripts/run-sync.ts 2026-07-01 2026-07-31
  npx tsx scripts/run-sync.ts 2026-07-31 2026-07-31 4702286319
`);
    process.exit(0);
  }

  // ---- bootstrap accounts into the DB -------------------------------------
  if (arg1 === 'bootstrap') {
    await bootstrapAccounts(AA_ACCOUNTS);

    const feeds = await prisma.feed.count();
    const accounts = await prisma.account.count();
    console.log(`\n✅ DB now has: ${feeds} feed(s), ${accounts} account(s)\n`);
    return;
  }

  // ---- sync a date range ---------------------------------------------------
  const startDate = arg1;
  const endDate = arg2 || arg1;
  const accountIds = arg3 ? [arg3] : undefined;

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate) || !dateRe.test(endDate)) {
    console.error('❌ Dates must be YYYY-MM-DD');
    process.exit(1);
  }

  const result = await syncRange(startDate, endDate, accountIds);

  console.log('RESULT:', JSON.stringify(result, null, 2));

  // Show what actually landed in the DB
  const [campaigns, adsDaily, adsenseDaily] = await Promise.all([
    prisma.campaign.count(),
    prisma.adsDaily.count(),
    prisma.adsenseDaily.count(),
  ]);
  console.log(`\n📊 DB totals — campaigns: ${campaigns}, ads_daily: ${adsDaily}, adsense_daily: ${adsenseDaily}\n`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (e) => {
    console.error('❌ Sync failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
