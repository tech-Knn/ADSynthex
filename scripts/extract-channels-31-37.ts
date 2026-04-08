/**
 * Extract channel IDs for Predicto EST-31, 34, 35, 36, 37
 */

import { fetchGoogleAdsData } from '../lib/google-ads-api';
import { extractChannelIdsFromUrl } from '../lib/predicto-channel-mapper';

const NEW_ACCOUNTS = [
  { id: '3138682158', name: 'Predicto - EST - 31' },
  { id: '2851239327', name: 'Predicto - EST - 34' },
  { id: '7262761952', name: 'Predicto - EST - 35' },
  { id: '5651153058', name: 'Predicto - EST - 36' },
  { id: '8588048670', name: 'Predicto - EST - 37' },
];

async function extractChannels(accountId: string, accountName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${accountName} (${accountId})`);
  console.log('='.repeat(70));

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const data = await fetchGoogleAdsData(startDateStr, endDateStr, accountId, 'predicto');

    if (!data || !data.campaigns) {
      console.log('❌ No campaign data returned');
      return { accountId, accountName, channelIds: [] };
    }

    const campaigns = data.campaigns.filter((c: any) => c.customer_id === accountId);
    console.log(`Found ${campaigns.length} campaigns`);

    const channelIds = new Set<string>();

    campaigns.forEach((campaign: any) => {
      const urls: string[] = campaign.final_urls || [];
      urls.forEach((url: string) => {
        extractChannelIdsFromUrl(url).forEach(ch => channelIds.add(ch));
      });
    });

    const channels = Array.from(channelIds).sort();
    console.log(`Channels: [${channels.join(', ') || 'NONE'}]`);

    return { accountId, accountName, channelIds: channels };
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    return { accountId, accountName, channelIds: [] };
  }
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  CHANNEL EXTRACTION: EST-31, 34, 35, 36, 37');
  console.log('═'.repeat(70));

  const results: any[] = [];

  for (const acct of NEW_ACCOUNTS) {
    const result = await extractChannels(acct.id, acct.name);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n\n' + '═'.repeat(70));
  console.log('  RESULT — PASTE INTO account-access-control.ts & predicto-channel-ownership.ts');
  console.log('═'.repeat(70) + '\n');

  results.forEach(r => {
    const chStr = r.channelIds.map((c: string) => `'${c}'`).join(', ');
    console.log(`  // ${r.accountName}`);
    console.log(`  'CID_${r.accountId}': [${chStr}],\n`);
  });
}

main().catch(console.error);
