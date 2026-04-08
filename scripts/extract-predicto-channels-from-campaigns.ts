/**
 * Extract Predicto Channels from Google Ads Campaigns
 *
 * This script queries Google Ads campaigns for Predicto accounts
 * and extracts channel IDs from campaign final URL suffixes and ad final URLs.
 *
 * It then generates a mapping of account -> channels that can be used to
 * update lib/account-access-control.ts and lib/predicto-channel-ownership.ts
 */

import { initializeGoogleAdsClient } from '../lib/google-ads-api';
import { getMCCForAccount, getDefaultMCC } from '../lib/mcc-config';
import { extractChannelIdsFromUrl } from '../lib/predicto-channel-mapper';
import config from '../lib/google-ads-config';

// Predicto accounts that need channel extraction (accounts with empty channel arrays)
const PREDICTO_ACCOUNTS_TO_FIX = [
  { customerId: '6474140466', name: 'Predicto - EST - 05' },
  { customerId: '4920639194', name: 'Predicto - EST - 06' },
  { customerId: '1298005744', name: 'Predicto - EST - 08' },
  { customerId: '5777354952', name: 'Predicto - EST - 09' },
  { customerId: '1449565595', name: 'Predicto - EST - 10' },
  { customerId: '3485355192', name: 'Predicto - EST - 11' },
  { customerId: '8395624186', name: 'Predicto - EST - 12' },
  { customerId: '2866937044', name: 'Predicto - EST - 13' },
  { customerId: '8474169341', name: 'Predicto - EST - 14' },
  { customerId: '4690287335', name: 'Predicto - EST - 15' },
  { customerId: '9352426268', name: 'Predicto - EST - 16' },
  { customerId: '9084810037', name: 'Predicto - EST - 17' },
  { customerId: '4517107811', name: 'Predicto - EST - 18' },
  { customerId: '4272056005', name: 'Predicto - EST - 19' },
  { customerId: '2563438099', name: 'Predicto - EST - 20' },
  { customerId: '6731595092', name: 'Predicto - EST - 21' },
  { customerId: '8656375545', name: 'Predicto - EST - 22' },
  { customerId: '5802421650', name: 'Predicto - EST - 23' },
  { customerId: '1213532895', name: 'Predicto - EST - 24' },
  { customerId: '7273310309', name: 'Predicto - EST - 25' },
  { customerId: '3318899588', name: 'Predicto - EST - 26' },
  { customerId: '8997459454', name: 'Predicto - EST - 27' },
  { customerId: '5556851600', name: 'Predicto - EST - 28' },
  { customerId: '3907817554', name: 'Predicto - EST - 29' },
  { customerId: '7505004095', name: 'Predicto - EST - 30' },
  { customerId: '3138682158', name: 'Predicto - EST - 31' },
  { customerId: '2851239327', name: 'Predicto - EST - 34' },
  { customerId: '7262761952', name: 'Predicto - EST - 35' },
  { customerId: '5651153058', name: 'Predicto - EST - 36' },
  { customerId: '8588048670', name: 'Predicto - EST - 37' },
];

// Query to fetch campaigns with final URL suffix
const CAMPAIGN_QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    campaign.status,
    campaign.final_url_suffix,
    campaign.url_expansion_opt_out
  FROM campaign
  WHERE campaign.status IN ('ENABLED', 'PAUSED', 'REMOVED')
  ORDER BY campaign.name
`;

// Query to fetch ads with final URLs (removed limit, removed status filters to get all ads)
const AD_QUERY = `
  SELECT
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group.name,
    ad_group_ad.ad.id,
    ad_group_ad.ad.name,
    ad_group_ad.ad.final_urls,
    ad_group_ad.ad.expanded_text_ad.final_urls,
    ad_group_ad.ad.responsive_search_ad.final_urls,
    ad_group_ad.status
  FROM ad_group_ad
  WHERE campaign.status IN ('ENABLED', 'PAUSED', 'REMOVED')
`;

interface AccountChannelMapping {
  customerId: string;
  accountName: string;
  channels: Set<string>;
  campaignCount: number;
  adCount: number;
  sources: {
    [channelId: string]: {
      campaignSuffixes: string[];
      adUrls: string[];
    };
  };
}

async function extractChannelsFromAccount(
  customerId: string,
  accountName: string
): Promise<AccountChannelMapping> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Extracting channels for: ${accountName} (${customerId})`);
  console.log('='.repeat(80));

  const mapping: AccountChannelMapping = {
    customerId,
    accountName,
    channels: new Set(),
    campaignCount: 0,
    adCount: 0,
    sources: {},
  };

  try {
    // Initialize Google Ads client for this account
    const { client } = initializeGoogleAdsClient(customerId);
    const mccCreds = getMCCForAccount(customerId) || getDefaultMCC();
    const accountCustomer = client.Customer({
      customer_id: customerId,
      refresh_token: mccCreds.googleAds.refreshToken,
      login_customer_id: mccCreds.mccId,
    });

    // Step 1: Extract from campaign final URL suffixes
    console.log('\n📋 Fetching campaigns...');
    try {
      const campaignResponse = await accountCustomer.query(CAMPAIGN_QUERY);

      for (const row of campaignResponse || []) {
        mapping.campaignCount++;

        const campaignId = row.campaign?.id || '';
        const campaignName = row.campaign?.name || '';
        const finalUrlSuffix = row.campaign?.final_url_suffix || '';

        if (finalUrlSuffix) {
          // Extract channel IDs from suffix (e.g., "?cid=ch88087")
          const channels = extractChannelIdsFromUrl(`https://example.com${finalUrlSuffix}`);

          if (channels.length > 0) {
            console.log(`  ✓ Campaign: ${campaignName} (${campaignId})`);
            console.log(`    Suffix: ${finalUrlSuffix}`);
            console.log(`    Channels: ${channels.join(', ')}`);

            channels.forEach(ch => {
              mapping.channels.add(ch);

              if (!mapping.sources[ch]) {
                mapping.sources[ch] = { campaignSuffixes: [], adUrls: [] };
              }
              mapping.sources[ch].campaignSuffixes.push(
                `${campaignName}: ${finalUrlSuffix}`
              );
            });
          }
        }
      }

      console.log(`\n✓ Processed ${mapping.campaignCount} campaigns`);
    } catch (error: any) {
      console.warn(`⚠️  Failed to fetch campaigns:`, error.message);
    }

    // Step 2: Extract from ad final URLs
    console.log('\n📋 Fetching ads...');
    try {
      const adResponse = await accountCustomer.query(AD_QUERY);

      for (const row of adResponse || []) {
        mapping.adCount++;

        const campaignName = row.campaign?.name || '';
        const adId = row.ad_group_ad?.ad?.id || '';

        // Collect all final URLs from different ad types
        const allFinalUrls: string[] = [];

        // Standard final URLs (works for all ad types)
        const finalUrls = row.ad_group_ad?.ad?.final_urls || [];
        allFinalUrls.push(...finalUrls);

        if (allFinalUrls.length > 0) {
          allFinalUrls.forEach((url: string) => {
            if (!url) return;

            const channels = extractChannelIdsFromUrl(url);

            if (channels.length > 0) {
              console.log(`  ✓ Ad: ${adId} in ${campaignName}`);
              console.log(`    URL: ${url}`);
              console.log(`    Channels: ${channels.join(', ')}`);

              channels.forEach(ch => {
                mapping.channels.add(ch);

                if (!mapping.sources[ch]) {
                  mapping.sources[ch] = { campaignSuffixes: [], adUrls: [] };
                }
                mapping.sources[ch].adUrls.push(
                  `${campaignName} (Ad ${adId}): ${url}`
                );
              });
            }
          });
        }
      }

      console.log(`\n✓ Processed ${mapping.adCount} ads`);
    } catch (error: any) {
      console.warn(`⚠️  Failed to fetch ads:`, error.message);
    }

    // Summary for this account
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 Summary for ${accountName}:`);
    console.log(`   Channels found: ${mapping.channels.size}`);
    console.log(`   Channels: [${Array.from(mapping.channels).sort().join(', ')}]`);
    console.log('─'.repeat(80));

  } catch (error: any) {
    console.error(`\n❌ Error processing ${accountName}:`, error.message);
  }

  return mapping;
}

async function main() {
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  EXTRACTING PREDICTO CHANNELS FROM GOOGLE ADS CAMPAIGNS');
  console.log('═'.repeat(80));
  console.log('\nThis script will query Google Ads campaigns for Predicto accounts');
  console.log('and extract channel IDs from final URLs.\n');

  const allMappings: AccountChannelMapping[] = [];

  // Process each account sequentially to avoid rate limits
  for (const account of PREDICTO_ACCOUNTS_TO_FIX) {
    const mapping = await extractChannelsFromAccount(
      account.customerId,
      account.name
    );

    allMappings.push(mapping);

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Generate final report
  console.log('\n\n');
  console.log('═'.repeat(80));
  console.log('  FINAL REPORT: CHANNEL ASSIGNMENTS');
  console.log('═'.repeat(80));
  console.log('\n');

  // Accounts with channels found
  const accountsWithChannels = allMappings.filter(m => m.channels.size > 0);
  const accountsWithoutChannels = allMappings.filter(m => m.channels.size === 0);

  console.log(`✅ Accounts with channels found: ${accountsWithChannels.length}`);
  console.log(`❌ Accounts with NO channels: ${accountsWithoutChannels.length}\n`);

  // Generate configuration updates
  console.log('─'.repeat(80));
  console.log('CODE TO ADD TO lib/account-access-control.ts:');
  console.log('─'.repeat(80));
  console.log('\n');

  accountsWithChannels.forEach(mapping => {
    const channelArray = Array.from(mapping.channels).sort();
    console.log(`  // ${mapping.accountName}: ${mapping.campaignCount} campaigns, ${mapping.adCount} ads`);
    console.log(`  'CID_${mapping.customerId}': [${channelArray.map(ch => `'${ch}'`).join(', ')}],\n`);
  });

  console.log('\n');
  console.log('─'.repeat(80));
  console.log('CODE TO ADD TO lib/predicto-channel-ownership.ts:');
  console.log('─'.repeat(80));
  console.log('\n');

  accountsWithChannels.forEach(mapping => {
    const channelArray = Array.from(mapping.channels).sort();
    console.log(`  {`);
    console.log(`    customer_id: '${mapping.customerId}',`);
    console.log(`    account_name: '${mapping.accountName}',`);
    console.log(`    channel_ids: [${channelArray.map(ch => `'${ch}'`).join(', ')}],`);
    console.log(`  },\n`);
  });

  // Accounts without channels - need manual investigation
  if (accountsWithoutChannels.length > 0) {
    console.log('\n');
    console.log('─'.repeat(80));
    console.log('⚠️  ACCOUNTS WITH NO CHANNELS FOUND:');
    console.log('─'.repeat(80));
    console.log('\nThese accounts may not have ?cid= parameters in their campaigns.');
    console.log('You may need to:');
    console.log('  1. Check campaigns manually in Google Ads UI');
    console.log('  2. Add ?cid= parameters to campaign URLs');
    console.log('  3. Or check Predicto dashboard for channel assignments\n');

    accountsWithoutChannels.forEach(mapping => {
      console.log(`  - ${mapping.accountName} (${mapping.customerId})`);
    });
    console.log('\n');
  }

  // Save to JSON file for reference
  const fs = require('fs');
  const outputData = {
    generatedAt: new Date().toISOString(),
    accountsProcessed: allMappings.length,
    accountsWithChannels: accountsWithChannels.length,
    accountsWithoutChannels: accountsWithoutChannels.length,
    mappings: allMappings.map(m => ({
      customerId: m.customerId,
      accountName: m.accountName,
      channels: Array.from(m.channels).sort(),
      campaignCount: m.campaignCount,
      adCount: m.adCount,
      sources: m.sources,
    })),
  };

  fs.writeFileSync(
    'predicto-channel-mappings.json',
    JSON.stringify(outputData, null, 2)
  );

  console.log('📄 Detailed report saved to: predicto-channel-mappings.json\n');

  console.log('═'.repeat(80));
  console.log('  EXTRACTION COMPLETE');
  console.log('═'.repeat(80));
  console.log('\n');
}

// Run the extraction
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
