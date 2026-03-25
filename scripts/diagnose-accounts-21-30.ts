/**
 * Diagnostic Script for Accounts 21-30
 *
 * Investigates cost recording issues by:
 * 1. Fetching Google Ads campaigns for accounts 21-30
 * 2. Extracting channel IDs from campaign URLs
 * 3. Checking if campaigns have cost data
 * 4. Identifying which channels should be assigned to each account
 */

import { fetchGoogleAdsData } from '../lib/google-ads-api';
import { extractChannelIdsFromUrl } from '../lib/predicto-channel-mapper';

const ACCOUNTS_21_TO_30 = [
  { id: '6731595092', name: 'Predicto - EST - 21' },
  { id: '8656375545', name: 'Predicto - EST - 22' },
  { id: '5802421650', name: 'Predicto - EST - 23' },
  { id: '1213532895', name: 'Predicto - EST - 24' },
  { id: '7273310309', name: 'Predicto - EST - 25' },
  { id: '3318899588', name: 'Predicto - EST - 26' },
  { id: '8997459454', name: 'Predicto - EST - 27' },
  { id: '5556851600', name: 'Predicto - EST - 28' },
  { id: '3907817554', name: 'Predicto - EST - 29' },
  { id: '7505004095', name: 'Predicto - EST - 30' },
];

async function diagnoseAccount(accountId: string, accountName: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALYZING: ${accountName} (${accountId})`);
  console.log('='.repeat(80));

  try {
    // Fetch last 30 days of data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    console.log(`\nFetching Google Ads data: ${startDateStr} to ${endDateStr}`);

    const data = await fetchGoogleAdsData({
      startDate: startDateStr,
      endDate: endDateStr,
      customerId: accountId,
      feedType: 'predicto',
    });

    if (!data || !data.campaigns) {
      console.log('❌ No campaign data returned');
      return null;
    }

    const campaigns = data.campaigns.filter((c: any) => c.customer_id === accountId);

    console.log(`\n📊 Found ${campaigns.length} campaigns`);

    if (campaigns.length === 0) {
      console.log('⚠️  No campaigns found for this account');
      return null;
    }

    // Analyze campaigns
    let totalCost = 0;
    const channelIds = new Set<string>();
    const campaignDetails: any[] = [];

    campaigns.forEach((campaign: any) => {
      const cost = campaign.cost || 0;
      totalCost += cost;

      // Extract channel IDs from final URLs
      let campaignChannels: string[] = [];
      if (campaign.final_urls && campaign.final_urls.length > 0) {
        campaign.final_urls.forEach((url: string) => {
          const extracted = extractChannelIdsFromUrl(url);
          campaignChannels = [...campaignChannels, ...extracted];
        });
      }

      campaignChannels.forEach(ch => channelIds.add(ch));

      campaignDetails.push({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        cost,
        impressions: campaign.impressions || 0,
        clicks: campaign.clicks || 0,
        final_urls: campaign.final_urls || [],
        channels: campaignChannels,
      });
    });

    // Sort by cost
    campaignDetails.sort((a, b) => b.cost - a.cost);

    console.log(`\n💰 Total Cost: $${totalCost.toFixed(2)}`);
    console.log(`📺 Unique Channels Found: ${channelIds.size}`);

    if (channelIds.size > 0) {
      console.log(`   Channels: [${Array.from(channelIds).join(', ')}]`);
    } else {
      console.log(`   ⚠️  NO CHANNEL IDs FOUND - Campaigns may be missing ?cid= parameters`);
    }

    console.log(`\n📋 Campaign Details:`);
    console.log('-'.repeat(80));

    campaignDetails.forEach((campaign, index) => {
      console.log(`\n${index + 1}. ${campaign.campaign_name || campaign.campaign_id}`);
      console.log(`   Cost: $${campaign.cost.toFixed(2)}`);
      console.log(`   Clicks: ${campaign.clicks}`);
      console.log(`   Impressions: ${campaign.impressions}`);

      if (campaign.channels.length > 0) {
        console.log(`   ✅ Channels: [${campaign.channels.join(', ')}]`);
      } else {
        console.log(`   ❌ No channels found`);
      }

      if (campaign.final_urls.length > 0) {
        console.log(`   URLs: ${campaign.final_urls[0]}`);
        if (campaign.final_urls.length > 1) {
          console.log(`         ... and ${campaign.final_urls.length - 1} more`);
        }
      } else {
        console.log(`   ⚠️  No final URLs`);
      }
    });

    return {
      accountId,
      accountName,
      totalCost,
      campaignCount: campaigns.length,
      channelIds: Array.from(channelIds),
      campaigns: campaignDetails,
    };

  } catch (error: any) {
    console.error(`\n❌ Error analyzing ${accountName}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  GOOGLE ADS DIAGNOSTIC FOR ACCOUNTS 21-30');
  console.log('  Investigating Cost Recording Issues');
  console.log('═'.repeat(80));

  const results: any[] = [];

  // Analyze each account
  for (const account of ACCOUNTS_21_TO_30) {
    const result = await diagnoseAccount(account.id, account.name);
    if (result) {
      results.push(result);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  SUMMARY: ACCOUNTS 21-30');
  console.log('═'.repeat(80));

  const accountsWithCost = results.filter(r => r.totalCost > 0);
  const accountsWithChannels = results.filter(r => r.channelIds.length > 0);
  const accountsWithoutChannels = results.filter(r => r.totalCost > 0 && r.channelIds.length === 0);

  const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);
  const allChannels = new Set<string>();
  results.forEach(r => r.channelIds.forEach((ch: string) => allChannels.add(ch)));

  console.log(`\nAccounts Analyzed: ${results.length}`);
  console.log(`Accounts with Cost: ${accountsWithCost.length}`);
  console.log(`Accounts with Channels: ${accountsWithChannels.length}`);
  console.log(`Total Cost (30 days): $${totalCost.toFixed(2)}`);
  console.log(`Unique Channels Detected: ${allChannels.size}`);

  if (allChannels.size > 0) {
    console.log(`\n📺 All Channels: [${Array.from(allChannels).sort().join(', ')}]`);
  }

  // Accounts needing attention
  if (accountsWithoutChannels.length > 0) {
    console.log(`\n🚨 ACCOUNTS WITH COST BUT NO CHANNELS (${accountsWithoutChannels.length}):`);
    console.log('-'.repeat(80));
    accountsWithoutChannels.forEach(account => {
      console.log(`  ${account.accountName}: $${account.totalCost.toFixed(2)} cost, ${account.campaignCount} campaigns`);
      console.log(`    ⚠️  Action needed: Add ?cid= parameters to campaign URLs`);
    });
  }

  // Configuration recommendations
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  CONFIGURATION RECOMMENDATIONS');
  console.log('═'.repeat(80));

  if (accountsWithChannels.length > 0) {
    console.log('\n✅ Channels detected for these accounts. Update configuration:\n');
    console.log('File 1: lib/account-access-control.ts');
    console.log('-'.repeat(80));

    accountsWithChannels.forEach(account => {
      if (account.channelIds.length > 0) {
        const channels = account.channelIds.map((ch: string) => `'${ch}'`).join(', ');
        console.log(`'CID_${account.accountId}': [${channels}], // ${account.accountName}`);
      }
    });

    console.log('\nFile 2: lib/predicto-channel-ownership.ts');
    console.log('-'.repeat(80));

    accountsWithChannels.forEach(account => {
      if (account.channelIds.length > 0) {
        const channels = account.channelIds.map((ch: string) => `'${ch}'`).join(', ');
        console.log(`{`);
        console.log(`  customer_id: '${account.accountId}',`);
        console.log(`  account_name: '${account.accountName}',`);
        console.log(`  channel_ids: [${channels}],`);
        console.log(`},`);
      }
    });
  }

  if (accountsWithoutChannels.length > 0) {
    console.log('\n⚠️  ACCOUNTS WITHOUT CHANNEL DETECTION:');
    console.log('-'.repeat(80));
    console.log('These accounts have cost but campaigns are missing ?cid= parameters.');
    console.log('Options:');
    console.log('  1. Add ?cid=chXXXXX to campaign final URLs in Google Ads');
    console.log('  2. Check Predicto dashboard to manually identify channel ownership');
    console.log('  3. Run /api/predicto-channel-diagnostic to find orphaned revenue\n');
  }

  console.log('\n✅ Diagnostic complete!\n');
}

// Run the diagnostic
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
