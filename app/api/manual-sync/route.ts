// app/api/manual-sync/route.ts
// Manual Sync Trigger - Allows users to request an immediate sync (with rate limiting)

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 30 seconds timeout for manual trigger

export async function POST(request: Request) {
  try {
    // Check authentication
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;

    if (!authType) {
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'You must be logged in to trigger a sync'
      }, { status: 401 });
    }

    // Get last manual sync time from cookies (simple rate limiting)
    const lastManualSync = cookieStore.get('last_manual_sync')?.value;
    const now = Date.now();

    if (lastManualSync) {
      const timeSinceLastSync = now - parseInt(lastManualSync);
      const minutesSinceLastSync = Math.floor(timeSinceLastSync / 60000);

      // Prevent spam: Only allow manual sync every 5 minutes
      if (timeSinceLastSync < 5 * 60 * 1000) {
        return NextResponse.json({
          error: 'Rate limit exceeded',
          message: `Please wait ${5 - minutesSinceLastSync} more minute(s) before triggering another sync`,
          retryAfterMinutes: 5 - minutesSinceLastSync,
          lastSyncMinutesAgo: minutesSinceLastSync
        }, { status: 429 });
      }
    }

    console.log('[MANUAL_SYNC] User triggered manual sync');

    // Trigger the sync endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[MANUAL_SYNC] CRON_SECRET not configured');
      return NextResponse.json({
        error: 'Configuration error',
        message: 'Sync service is not properly configured'
      }, { status: 500 });
    }

    // Trigger sync (fire and forget - don't wait for completion)
    fetch(`${appUrl}/api/cron/sync-all-feeds`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'User-Agent': 'AdSyntheX-ManualSync/1.0'
      }
    }).catch(error => {
      console.error('[MANUAL_SYNC] Failed to trigger sync:', error);
    });

    // Update last manual sync time
    const response = NextResponse.json({
      success: true,
      message: 'Sync triggered successfully',
      note: 'Sync is running in the background. Data will be updated in 2-3 minutes.',
      estimatedCompletionMinutes: 3,
      checkSyncStatus: '/api/sync-status'
    });

    // Set cookie to track last manual sync time
    response.cookies.set('last_manual_sync', now.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 // 1 hour
    });

    return response;

  } catch (error: any) {
    console.error('[MANUAL_SYNC] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message
    }, { status: 500 });
  }
}

// GET endpoint for checking manual sync availability
export async function GET(request: Request) {
  try {
    const cookieStore = cookies();
    const authType = cookieStore.get('auth_type')?.value;

    if (!authType) {
      return NextResponse.json({
        error: 'Unauthorized'
      }, { status: 401 });
    }

    const lastManualSync = cookieStore.get('last_manual_sync')?.value;
    const now = Date.now();

    let canSync = true;
    let waitMinutes = 0;

    if (lastManualSync) {
      const timeSinceLastSync = now - parseInt(lastManualSync);
      const minutesSinceLastSync = Math.floor(timeSinceLastSync / 60000);

      if (timeSinceLastSync < 5 * 60 * 1000) {
        canSync = false;
        waitMinutes = 5 - minutesSinceLastSync;
      }
    }

    return NextResponse.json({
      canSync,
      waitMinutes,
      rateLimit: '1 manual sync per 5 minutes',
      note: 'Automatic sync runs every hour'
    });

  } catch (error: any) {
    console.error('[MANUAL_SYNC] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message
    }, { status: 500 });
  }
}
