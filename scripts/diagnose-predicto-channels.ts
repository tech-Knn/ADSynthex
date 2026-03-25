/**
 * Predicto Channel Diagnostic Script
 *
 * This script verifies:
 * 1. Channel extraction from URLs is working correctly
 * 2. Predicto API returns revenue data with correct channel IDs
 * 3. Channel-to-account mapping is configured properly
 * 4. Revenue matching is working for all accounts
 * 5. Identifies orphaned revenue (channels not assigned to any account)
 */

import { predictoApiClient } from '../lib/predicto-api';
import { extractChannelIdsFromUrl } from '../lib/predicto-channel-mapper';
import { ACCOUNT_CHANNEL_ACCESS, getAllowedChannels } from '../lib/account-access-control';
import { CHANNEL_OWNERSHIP } from '../lib/predicto-channel-ownership';

// Test URLs for channel extraction
const TEST_URLS = [
  'https://tunefulsoul.com/asrsearch?cid=ch88087',
  'https://tunefulsoul.com/asrsearch?cid=ch88087+ch88098',
  'https://tunefulsoul.com/asrsearch?cid=CH88087',  // Test case sensitivity
  'https://tunefulsoul.com/asrsearch?cid=ch88087,ch88098',  // Test comma separator
  'https://tunefulsoul.com/asrsearch?campaign_id={campaignid}',  // No cid
  'https://tunefulsoul.com/asrsearch?cid=ch46405&campaign_id={campaignid}',
];

async function testChannelExtraction() {
  console.log('\n========== TESTING CHANNEL EXTRACTION ==========\n');

  TEST_URLS.forEach((url, index) => {
    const channels = extractChannelIdsFromUrl(url);
    console.log(`Test ${index + 1}: ${url}`);
    console.log(`  Extracted: [${channels.join(', ')}]`);
    console.log(`  Count: ${channels.length}`);
  });

  console.log('\n✅ Channel extraction test complete\n');
}

async function fetchPredictoRevenue() {
  console.log('\n========== FETCHING PREDICTO REVENUE DATA ==========\n');

  // Fetch last 7 days of revenue
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  console.log(`Fetching Predicto revenue: ${startDateStr} to ${endDateStr}\n`);

  try {
    const revenueData = await predictoApiClient.fetchRevenueData({
      start_date: startDateStr,
      end_date: endDateStr,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    console.log(`✅ Retrieved ${revenueData.length} revenue records\n`);

    // Aggregate by channel
    const channelMap = new Map<string, {
      revenue: number;
      clicks: number;
      impressions: number;
      days: Set<string>;
    }>();

    revenueData.forEach(record => {
      const channelId = record.custom_channel_id || 'unknown';

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, {
          revenue: 0,
          clicks: 0,
          impressions: 0,
          days: new Set(),
        });
      }

      const channel = channelMap.get(channelId)!;
      channel.revenue += record.revenue || 0;
      channel.clicks += record.clicks || 0;
      channel.impressions += record.impressions || 0;
      if (record.date) {
        channel.days.add(record.date);
      }
    });

    // Sort channels by revenue
    const sortedChannels = Array.from(channelMap.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue);

    console.log(`📊 Found ${sortedChannels.length} unique channels with revenue:\n`);

    // Show top 20 channels
    console.log('Top 20 Channels by Revenue:');
    console.log('─'.repeat(80));
    sortedChannels.slice(0, 20).forEach(([channelId, data], index) => {
      const assigned = isChannelAssignedToAccount(channelId);
      const assignedTo = assigned ? getAccountForChannel(channelId) : 'ORPHANED';
      console.log(
        `${(index + 1).toString().padStart(2)}. ${channelId.padEnd(12)} | ` +
        `$${data.revenue.toFixed(2).padStart(10)} | ` +
        `${data.clicks.toString().padStart(6)} clicks | ` +
        `${data.days.size} days | ` +
        `${assignedTo}`
      );
    });

    // Calculate total revenue
    const totalRevenue = sortedChannels.reduce((sum, [_, data]) => sum + data.revenue, 0);
    console.log('─'.repeat(80));
    console.log(`Total Revenue: $${totalRevenue.toFixed(2)}\n`);

    // Identify orphaned channels
    const orphanedChannels = sortedChannels.filter(([channelId]) => !isChannelAssignedToAccount(channelId));
    const orphanedRevenue = orphanedChannels.reduce((sum, [_, data]) => sum + data.revenue, 0);

    console.log(`\n🚨 ORPHANED CHANNELS (Revenue but NO account assignment):\n`);
    console.log(`Found ${orphanedChannels.length} orphaned channels with $${orphanedRevenue.toFixed(2)} revenue\n`);

    if (orphanedChannels.length > 0) {
      console.log('Orphaned Channels:');
      console.log('─'.repeat(80));
      orphanedChannels.slice(0, 10).forEach(([channelId, data], index) => {
        console.log(
          `${(index + 1).toString().padStart(2)}. ${channelId.padEnd(12)} | ` +
          `$${data.revenue.toFixed(2).padStart(10)} | ` +
          `${data.clicks.toString().padStart(6)} clicks`
        );
      });
      console.log('─'.repeat(80));
      console.log(`\n⚠️  These channels need to be assigned to accounts in lib/account-access-control.ts\n`);
    }

    return { channelMap, orphanedChannels, orphanedRevenue };
  } catch (error) {
    console.error('❌ Failed to fetch Predicto revenue:', error);
    throw error;
  }
}

function isChannelAssignedToAccount(channelId: string): boolean {
  const normalizedChannelId = channelId.toLowerCase();

  for (const channels of Object.values(ACCOUNT_CHANNEL_ACCESS)) {
    const normalizedChannels = channels.map(ch => ch.toLowerCase());
    if (normalizedChannels.includes(normalizedChannelId)) {
      return true;
    }
  }

  return false;
}

function getAccountForChannel(channelId: string): string {
  const normalizedChannelId = channelId.toLowerCase();

  for (const [accountId, channels] of Object.entries(ACCOUNT_CHANNEL_ACCESS)) {
    const normalizedChannels = channels.map(ch => ch.toLowerCase());
    if (normalizedChannels.includes(normalizedChannelId)) {
      // Remove CID_ prefix and get account name
      const customerId = accountId.replace('CID_', '');
      const accountConfig = CHANNEL_OWNERSHIP.find(a => a.customer_id === customerId);
      return accountConfig?.account_name || customerId;
    }
  }

  return 'Unknown';
}

async function verifyChannelConfiguration() {
  console.log('\n========== VERIFYING CHANNEL CONFIGURATION ==========\n');

  const allPredictoAccounts = [
    { customerId: '2382992113', name: 'Predicto - EST - 01' },
    { customerId: '1640518611', name: 'Predicto - EST - 02' },
    { customerId: '8091270364', name: 'Predicto - EST - 03' },
    { customerId: '8846129452', name: 'Predicto - EST - 04' },
    { customerId: '6474140466', name: 'Predicto - EST - 05' },
    { customerId: '4920639194', name: 'Predicto - EST - 06' },
    { customerId: '7282297343', name: 'Predicto - EST - 07' },
    { customerId: '1298005744', name: 'Predicto - EST - 08' },
    { customerId: '5777354952', name: 'Predicto - EST - 09' },  // THIS IS THE PROBLEM ACCOUNT
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
  ];

  console.log('Channel Configuration by Account:\n');
  console.log('─'.repeat(80));

  let totalChannelsConfigured = 0;
  const accountsWithNoChannels: string[] = [];

  allPredictoAccounts.forEach(account => {
    const normalizedCustomerId = `CID_${account.customerId}`;
    const channels = getAllowedChannels(normalizedCustomerId);

    totalChannelsConfigured += channels.length;

    if (channels.length === 0) {
      accountsWithNoChannels.push(account.name);
      console.log(`❌ ${account.name.padEnd(25)} | ${account.customerId.padEnd(12)} | NO CHANNELS CONFIGURED`);
    } else {
      console.log(`✅ ${account.name.padEnd(25)} | ${account.customerId.padEnd(12)} | ${channels.length.toString().padStart(2)} channels: ${channels.slice(0, 5).join(', ')}${channels.length > 5 ? '...' : ''}`);
    }
  });

  console.log('─'.repeat(80));
  console.log(`\nTotal Channels Configured: ${totalChannelsConfigured}`);
  console.log(`Accounts with NO channels: ${accountsWithNoChannels.length}\n`);

  if (accountsWithNoChannels.length > 0) {
    console.log('🚨 ACCOUNTS WITH NO CHANNELS:\n');
    accountsWithNoChannels.forEach((name, index) => {
      console.log(`  ${index + 1}. ${name}`);
    });
    console.log('\n⚠️  These accounts will NOT show revenue unless:');
    console.log('   1. Channels are configured in lib/account-access-control.ts');
    console.log('   2. OR campaigns have ?cid= parameters in final URLs\n');
  }
}

async function checkAccountRevenue(customerId: string, accountName: string, channelMap: Map<string, any>) {
  console.log(`\n========== CHECKING REVENUE FOR ${accountName} (${customerId}) ==========\n`);

  const normalizedCustomerId = `CID_${customerId}`;
  const assignedChannels = getAllowedChannels(normalizedCustomerId);

  console.log(`Assigned Channels: [${assignedChannels.join(', ') || 'NONE'}]\n`);

  if (assignedChannels.length === 0) {
    console.log('❌ NO CHANNELS ASSIGNED - This account will NOT fetch revenue!\n');
    console.log('Recommended actions:');
    console.log('  1. Check Predicto dashboard to see which channels this account uses');
    console.log('  2. Add those channels to ACCOUNT_CHANNEL_ACCESS in lib/account-access-control.ts');
    console.log('  3. Update CHANNEL_OWNERSHIP in lib/predicto-channel-ownership.ts\n');
    return;
  }

  // Calculate revenue for assigned channels
  let totalRevenue = 0;
  let totalClicks = 0;
  let foundChannels = 0;

  console.log('Revenue Breakdown by Channel:');
  console.log('─'.repeat(60));

  assignedChannels.forEach(channelId => {
    const channelData = channelMap.get(channelId.toLowerCase()) || channelMap.get(channelId);

    if (channelData) {
      foundChannels++;
      totalRevenue += channelData.revenue;
      totalClicks += channelData.clicks;
      console.log(
        `✅ ${channelId.padEnd(12)} | $${channelData.revenue.toFixed(2).padStart(10)} | ${channelData.clicks.toString().padStart(6)} clicks`
      );
    } else {
      console.log(`❌ ${channelId.padEnd(12)} | NO DATA (channel not active or misconfigured)`);
    }
  });

  console.log('─'.repeat(60));
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`Total Clicks: ${totalClicks}`);
  console.log(`Active Channels: ${foundChannels}/${assignedChannels.length}\n`);

  if (totalRevenue === 0) {
    console.log('⚠️  WARNING: Total revenue is $0!');
    console.log('   - Check if channels are correct');
    console.log('   - Verify campaigns are running');
    console.log('   - Check date range (last 7 days)\n');
  }
}

async function main() {
  console.log('\n');
  console.log('═'.repeat(80));
  console.log('  PREDICTO CHANNEL DIAGNOSTIC TOOL');
  console.log('═'.repeat(80));

  try {
    // Step 1: Test channel extraction
    await testChannelExtraction();

    // Step 2: Fetch Predicto revenue and identify orphaned channels
    const { channelMap, orphanedChannels, orphanedRevenue } = await fetchPredictoRevenue();

    // Step 3: Verify channel configuration for all accounts
    await verifyChannelConfiguration();

    // Step 4: Check specific accounts that might have issues
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('  CHECKING SPECIFIC ACCOUNTS');
    console.log('═'.repeat(80));

    // Check EST-09 (the problem account mentioned by user)
    await checkAccountRevenue('5777354952', 'Predicto - EST - 09', channelMap);

    // Check a few other accounts for comparison
    await checkAccountRevenue('2382992113', 'Predicto - EST - 01', channelMap);
    await checkAccountRevenue('1640518611', 'Predicto - EST - 02', channelMap);

    // Final summary
    console.log('\n');
    console.log('═'.repeat(80));
    console.log('  DIAGNOSTIC SUMMARY');
    console.log('═'.repeat(80));
    console.log('\n');

    if (orphanedChannels.length > 0) {
      console.log(`🚨 ACTION REQUIRED: ${orphanedChannels.length} orphaned channels with $${orphanedRevenue.toFixed(2)} revenue`);
      console.log('   These channels need to be assigned to accounts.\n');
    }

    console.log('✅ Diagnostic complete!\n');
    console.log('Next steps:');
    console.log('  1. Review orphaned channels and assign them to correct accounts');
    console.log('  2. Update lib/account-access-control.ts ACCOUNT_CHANNEL_ACCESS');
    console.log('  3. Update lib/predicto-channel-ownership.ts CHANNEL_OWNERSHIP');
    console.log('  4. Test revenue fetching for affected accounts\n');

  } catch (error) {
    console.error('\n❌ Diagnostic failed:', error);
    process.exit(1);
  }
}

// Run the diagnostic
main();
