/**
 * Find Orphaned Channels Script
 * Identifies channels with revenue that aren't assigned to any account
 */

import { predictoApiClient } from '../lib/predicto-api';
import { CHANNEL_OWNERSHIP } from '../lib/predicto-channel-ownership';

async function findOrphanedChannels() {
  console.log('\n='.repeat(80));
  console.log('FINDING ORPHANED CHANNELS WITH REVENUE');
  console.log('='.repeat(80));

  // Fetch last 30 days of revenue
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];

  console.log(`\nFetching Predicto revenue: ${startDateStr} to ${endDateStr}\n`);

  try {
    const revenueData = await predictoApiClient.fetchRevenueData({
      start_date: startDateStr,
      end_date: endDateStr,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id'],
    });

    console.log(`✅ Retrieved ${revenueData.length} revenue records\n`);

    // Aggregate by channel
    const channelMap = new Map<string, { revenue: number; clicks: number; impressions: number }>();

    revenueData.forEach(record => {
      const channelId = (record.custom_channel_id || 'unknown').toLowerCase();

      if (!channelMap.has(channelId)) {
        channelMap.set(channelId, { revenue: 0, clicks: 0, impressions: 0 });
      }

      const channel = channelMap.get(channelId)!;
      channel.revenue += record.revenue || 0;
      channel.clicks += record.clicks || 0;
      channel.impressions += record.impressions || 0;
    });

    // Build set of assigned channels
    const assignedChannels = new Set<string>();
    CHANNEL_OWNERSHIP.forEach(account => {
      account.channel_ids.forEach(ch => assignedChannels.add(ch.toLowerCase()));
    });

    console.log(`📊 Total unique channels with revenue: ${channelMap.size}`);
    console.log(`✅ Channels already assigned: ${assignedChannels.size}\n`);

    // Find orphaned channels
    const orphanedChannels = Array.from(channelMap.entries())
      .filter(([channelId]) => !assignedChannels.has(channelId))
      .sort((a, b) => b[1].revenue - a[1].revenue);

    const orphanedRevenue = orphanedChannels.reduce((sum, [_, data]) => sum + data.revenue, 0);

    console.log(`🚨 ORPHANED CHANNELS: ${orphanedChannels.length}`);
    console.log(`💰 Orphaned Revenue: $${orphanedRevenue.toFixed(2)}\n`);

    if (orphanedChannels.length === 0) {
      console.log('✅ No orphaned channels found! All channels are assigned.\n');
      return;
    }

    console.log('Orphaned Channels (sorted by revenue):');
    console.log('-'.repeat(80));
    console.log('Channel ID   | Revenue      | Clicks   | Impressions');
    console.log('-'.repeat(80));

    orphanedChannels.forEach(([channelId, data]) => {
      console.log(
        `${channelId.padEnd(12)} | $${data.revenue.toFixed(2).padStart(10)} | ${data.clicks.toString().padStart(8)} | ${data.impressions.toString().padStart(10)}`
      );
    });

    console.log('-'.repeat(80));
    console.log(`Total: ${orphanedChannels.length} channels | $${orphanedRevenue.toFixed(2)} revenue\n`);

    // Show accounts with no channels
    const accountsWithNoChannels = CHANNEL_OWNERSHIP.filter(a => a.channel_ids.length === 0);

    console.log(`\n📋 ACCOUNTS WITH NO CHANNELS ASSIGNED: ${accountsWithNoChannels.length}`);
    console.log('-'.repeat(80));
    accountsWithNoChannels.forEach(account => {
      console.log(`  ${account.account_name} (${account.customer_id})`);
    });

    console.log('\n');
    console.log('='.repeat(80));
    console.log('NEXT STEPS');
    console.log('='.repeat(80));
    console.log('\n1. Identify which orphaned channels belong to accounts 21-30');
    console.log('   - Check Google Ads campaigns for each account');
    console.log('   - Look for ?cid= parameters in campaign URLs');
    console.log('   - OR check Predicto dashboard for channel assignments\n');
    console.log('2. Update lib/account-access-control.ts');
    console.log('3. Update lib/predicto-channel-ownership.ts');
    console.log('4. Verify revenue appears correctly\n');

    // Export to JSON for easier processing
    const exportData = {
      dateRange: { startDate: startDateStr, endDate: endDateStr },
      orphanedChannels: orphanedChannels.map(([channelId, data]) => ({
        channelId,
        revenue: data.revenue,
        clicks: data.clicks,
        impressions: data.impressions,
      })),
      accountsWithNoChannels: accountsWithNoChannels.map(a => ({
        customerId: a.customer_id,
        accountName: a.account_name,
      })),
      totalOrphanedRevenue: orphanedRevenue,
    };

    // Write to file
    const fs = require('fs');
    fs.writeFileSync(
      'orphaned-channels-report.json',
      JSON.stringify(exportData, null, 2)
    );

    console.log('📄 Report saved to: orphaned-channels-report.json\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

findOrphanedChannels().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
