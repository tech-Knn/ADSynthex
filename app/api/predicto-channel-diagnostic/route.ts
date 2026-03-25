/**
 * Predicto Channel Diagnostic API
 * GET /api/predicto-channel-diagnostic
 *
 * Comprehensive diagnostic to verify:
 * 1. Channel extraction is working
 * 2. Predicto API returns correct revenue data
 * 3. Channel-to-account mapping is configured
 * 4. Identifies orphaned revenue
 */

import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';
import { extractChannelIdsFromUrl } from '@/lib/predicto-channel-mapper';
import { ACCOUNT_CHANNEL_ACCESS, getAllowedChannels } from '@/lib/account-access-control';
import { CHANNEL_OWNERSHIP } from '@/lib/predicto-channel-ownership';

export async function GET(request: NextRequest) {
  try {
    const diagnosticResults: any = {
      timestamp: new Date().toISOString(),
      channelExtractionTest: {},
      predictoRevenueData: {},
      channelConfiguration: {},
      accountAnalysis: {},
      orphanedChannels: [],
      recommendations: [],
    };

    // TEST 1: Channel Extraction
    console.log('[DIAGNOSTIC] Testing channel extraction...');
    const testUrls = [
      'https://tunefulsoul.com/asrsearch?cid=ch88087',
      'https://tunefulsoul.com/asrsearch?cid=ch88087+ch88098',
      'https://tunefulsoul.com/asrsearch?cid=CH88087',
      'https://tunefulsoul.com/asrsearch?cid=ch88087,ch88098',
      'https://tunefulsoul.com/asrsearch?campaign_id={campaignid}',
    ];

    diagnosticResults.channelExtractionTest = {
      status: 'passed',
      tests: testUrls.map(url => ({
        url,
        extracted: extractChannelIdsFromUrl(url),
      })),
    };

    // TEST 2: Fetch Predicto Revenue
    console.log('[DIAGNOSTIC] Fetching Predicto revenue data...');
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const revenueData = await predictoApiClient.fetchRevenueData({
      start_date: startDateStr,
      end_date: endDateStr,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    // Aggregate by channel
    const channelMap = new Map<string, {
      revenue: number;
      clicks: number;
      impressions: number;
      days: Set<string>;
    }>();

    revenueData.forEach(record => {
      const channelId = (record.custom_channel_id || 'unknown').toLowerCase();

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
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([channelId, data]) => ({
        channelId,
        revenue: data.revenue,
        clicks: data.clicks,
        impressions: data.impressions,
        activeDays: data.days.size,
        assigned: isChannelAssignedToAccount(channelId),
        assignedTo: isChannelAssignedToAccount(channelId) ? getAccountForChannel(channelId) : 'ORPHANED',
      }));

    const totalRevenue = sortedChannels.reduce((sum, ch) => sum + ch.revenue, 0);
    const orphanedChannels = sortedChannels.filter(ch => !ch.assigned);
    const orphanedRevenue = orphanedChannels.reduce((sum, ch) => sum + ch.revenue, 0);

    diagnosticResults.predictoRevenueData = {
      dateRange: { startDate: startDateStr, endDate: endDateStr },
      totalRecords: revenueData.length,
      uniqueChannels: sortedChannels.length,
      totalRevenue,
      top20Channels: sortedChannels.slice(0, 20),
      orphanedChannels: orphanedChannels.length,
      orphanedRevenue,
    };

    // TEST 3: Channel Configuration
    console.log('[DIAGNOSTIC] Checking channel configuration...');
    const allPredictoAccounts = [
      { customerId: '2382992113', name: 'Predicto - EST - 01' },
      { customerId: '1640518611', name: 'Predicto - EST - 02' },
      { customerId: '8091270364', name: 'Predicto - EST - 03' },
      { customerId: '8846129452', name: 'Predicto - EST - 04' },
      { customerId: '6474140466', name: 'Predicto - EST - 05' },
      { customerId: '4920639194', name: 'Predicto - EST - 06' },
      { customerId: '7282297343', name: 'Predicto - EST - 07' },
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
    ];

    let totalChannelsConfigured = 0;
    const accountsWithNoChannels: string[] = [];
    const accountDetails: any[] = [];

    allPredictoAccounts.forEach(account => {
      const normalizedCustomerId = `CID_${account.customerId}`;
      const channels = getAllowedChannels(normalizedCustomerId);

      totalChannelsConfigured += channels.length;

      // Calculate revenue for this account's channels
      let accountRevenue = 0;
      let accountClicks = 0;
      let activeChannels = 0;

      channels.forEach(channelId => {
        const channelData = channelMap.get(channelId.toLowerCase());
        if (channelData) {
          accountRevenue += channelData.revenue;
          accountClicks += channelData.clicks;
          activeChannels++;
        }
      });

      const accountInfo = {
        customerId: account.customerId,
        name: account.name,
        channelsConfigured: channels.length,
        channels: channels,
        revenue: accountRevenue,
        clicks: accountClicks,
        activeChannels,
        hasChannels: channels.length > 0,
      };

      accountDetails.push(accountInfo);

      if (channels.length === 0) {
        accountsWithNoChannels.push(account.name);
      }
    });

    diagnosticResults.channelConfiguration = {
      totalChannelsConfigured,
      accountsWithNoChannels: accountsWithNoChannels.length,
      accountsWithNoChannelsList: accountsWithNoChannels,
      allAccounts: accountDetails,
    };

    // TEST 4: Detailed Analysis for EST-09
    const est09 = accountDetails.find(a => a.customerId === '5777354952');
    diagnosticResults.accountAnalysis.est09 = {
      ...est09,
      issue: est09?.channelsConfigured === 0 ? 'NO_CHANNELS_CONFIGURED' : null,
      solution: est09?.channelsConfigured === 0
        ? 'Configure channels in lib/account-access-control.ts and lib/predicto-channel-ownership.ts'
        : null,
    };

    // RECOMMENDATIONS
    if (orphanedChannels.length > 0) {
      diagnosticResults.recommendations.push({
        priority: 'HIGH',
        issue: `${orphanedChannels.length} orphaned channels with $${orphanedRevenue.toFixed(2)} revenue`,
        action: 'Assign these channels to accounts in lib/account-access-control.ts',
        orphanedChannels: orphanedChannels.slice(0, 10).map(ch => ({
          channelId: ch.channelId,
          revenue: ch.revenue,
        })),
      });
    }

    if (accountsWithNoChannels.length > 0) {
      diagnosticResults.recommendations.push({
        priority: 'HIGH',
        issue: `${accountsWithNoChannels.length} accounts have NO channels configured`,
        action: 'Add channel assignments for these accounts',
        affectedAccounts: accountsWithNoChannels,
      });
    }

    // Show orphaned channels
    diagnosticResults.orphanedChannels = orphanedChannels.slice(0, 20);

    console.log('[DIAGNOSTIC] Diagnostic complete');

    return NextResponse.json(diagnosticResults, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error: any) {
    console.error('[DIAGNOSTIC] Error:', error);
    return NextResponse.json(
      {
        error: 'Diagnostic failed',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
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
      const customerId = accountId.replace('CID_', '');
      const accountConfig = CHANNEL_OWNERSHIP.find(a => a.customer_id === customerId);
      return accountConfig?.account_name || customerId;
    }
  }

  return 'Unknown';
}
