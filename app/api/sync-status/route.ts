// app/api/sync-status/route.ts
// MongoDB Sync Status Monitoring Endpoint

import { NextResponse } from 'next/server';
import { getSyncStatus } from '@/lib/db/operations';
import { testConnection } from '@/lib/db/mongodb';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Test MongoDB connection
    const mongoConnected = await testConnection();

    if (!mongoConnected) {
      return NextResponse.json({
        error: 'MongoDB connection failed',
        mongodbConnected: false,
        lastSync: null,
        feeds: []
      }, { status: 503 });
    }

    // Get sync status for all feeds
    const statuses = await getSyncStatus();

    // Group by feed type
    const feedGroups: Record<string, any[]> = {};
    statuses.forEach(status => {
      if (!feedGroups[status.feed_type]) {
        feedGroups[status.feed_type] = [];
      }
      feedGroups[status.feed_type].push({
        accountId: status.account_id,
        status: status.status,
        lastSync: status.last_sync_time,
        lastSyncDate: status.last_sync_date,
        error: status.error_message,
        clicksSynced: status.clicks_synced,
        revenueSynced: status.revenue_records_synced,
        mappingsCreated: status.mappings_created
      });
    });

    // Calculate overall sync health
    const totalSyncs = statuses.length;
    const successfulSyncs = statuses.filter(s => s.status === 'success').length;
    const failedSyncs = statuses.filter(s => s.status === 'failed').length;
    const inProgressSyncs = statuses.filter(s => s.status === 'in_progress').length;

    // Get most recent sync time
    const mostRecentSync = statuses.length > 0
      ? statuses.reduce((latest, current) =>
          new Date(current.last_sync_time) > new Date(latest.last_sync_time) ? current : latest
        )
      : null;

    // Calculate time since last sync
    const timeSinceLastSync = mostRecentSync
      ? Math.round((Date.now() - new Date(mostRecentSync.last_sync_time).getTime()) / 60000)
      : null;

    // Determine sync health status
    let healthStatus = 'healthy';
    let healthMessage = 'All feeds syncing normally';

    if (!mostRecentSync) {
      healthStatus = 'unknown';
      healthMessage = 'No sync data available - sync may not have run yet';
    } else if (timeSinceLastSync && timeSinceLastSync > 90) {
      healthStatus = 'stale';
      healthMessage = `Last sync was ${timeSinceLastSync} minutes ago (expected every hour)`;
    } else if (failedSyncs > totalSyncs * 0.3) {
      healthStatus = 'unhealthy';
      healthMessage = `${failedSyncs} out of ${totalSyncs} syncs failed`;
    } else if (inProgressSyncs > 0) {
      healthStatus = 'syncing';
      healthMessage = `${inProgressSyncs} syncs currently in progress`;
    }

    return NextResponse.json({
      mongodbConnected: true,
      healthStatus,
      healthMessage,
      lastSync: mostRecentSync?.last_sync_time || null,
      timeSinceLastSyncMinutes: timeSinceLastSync,
      nextSyncIn: timeSinceLastSync ? 60 - (timeSinceLastSync % 60) : null,
      summary: {
        totalSyncs,
        successful: successfulSyncs,
        failed: failedSyncs,
        inProgress: inProgressSyncs
      },
      feeds: feedGroups,
      cronSchedule: 'Every hour (0 * * * *)',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[SYNC_STATUS] Error:', error);
    return NextResponse.json({
      error: 'Failed to fetch sync status',
      message: error.message,
      mongodbConnected: false
    }, { status: 500 });
  }
}
