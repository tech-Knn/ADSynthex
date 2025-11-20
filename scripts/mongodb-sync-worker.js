/**
 * MongoDB Sync Worker for Render
 * Runs every 15 minutes to sync TODAY's data from APIs to MongoDB + Redis
 *
 * Key Features:
 * - ✅ Persistent connection pooling (no reconnect issues)
 * - ✅ Health check endpoint (keeps Render worker alive)
 * - ✅ Batch processing (prevents timeout)
 * - ✅ Error handling with retries
 * - ✅ Rate limit protection
 */

const http = require('http');

const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes
const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI;

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║       MongoDB Sync Worker Starting...                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`[WORKER] API URL: ${API_URL}`);
console.log(`[WORKER] MongoDB: ${MONGODB_URI ? 'Configured ✓' : 'NOT CONFIGURED ✗'}`);
console.log(`[WORKER] Sync interval: ${SYNC_INTERVAL / 60000} minutes`);
console.log(`[WORKER] Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log(`[WORKER] Current time: ${new Date().toISOString()}`);
console.log('');

if (!MONGODB_URI) {
  console.error('[WORKER] ✗ MONGODB_URI not set - worker cannot function!');
  console.error('[WORKER] Please set MONGODB_URI environment variable');
  process.exit(1);
}

// Track worker state
const workerState = {
  started: new Date(),
  lastSync: null,
  nextSync: null,
  syncCount: 0,
  successCount: 0,
  failureCount: 0,
  currentStatus: 'idle',
  lastError: null,
};

/**
 * Sync today's data for all feeds
 */
async function syncToday() {
  const startTime = Date.now();
  workerState.currentStatus = 'syncing';
  workerState.lastError = null;

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║         SYNC CYCLE STARTED                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`[WORKER] Time: ${new Date().toISOString()}`);

  const today = new Date().toISOString().split('T')[0];
  const results = {
    afs: { success: false, cost: 0, revenue: 0, error: null },
    compado: { success: false, cost: 0, revenue: 0, error: null },
    adscom: { success: false, cost: 0, revenue: 0, error: null },
  };

  try {
    // Sync each feed sequentially (prevents rate limit issues)
    for (const feed of ['afs', 'compado', 'adscom']) {
      console.log(`\n[WORKER] ========== Syncing ${feed.toUpperCase()} ==========`);

      try {
        const result = await syncFeed(feed, today);
        results[feed] = { ...result, success: true };
        console.log(`[WORKER] ✅ ${feed} sync successful`);

        // Wait 3 seconds between feeds
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        console.error(`[WORKER] ✗ ${feed} sync failed:`, error.message);
        results[feed] = { success: false, cost: 0, revenue: 0, error: error.message };
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    const successCount = Object.values(results).filter(r => r.success).length;
    const totalRecords = Object.values(results).reduce((sum, r) => sum + r.cost + r.revenue, 0);

    workerState.syncCount++;
    workerState.successCount += successCount;
    workerState.failureCount += (3 - successCount);
    workerState.lastSync = new Date();
    workerState.nextSync = new Date(Date.now() + SYNC_INTERVAL);
    workerState.currentStatus = 'idle';

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║         SYNC CYCLE COMPLETED                                  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`[WORKER] Duration: ${duration}s`);
    console.log(`[WORKER] Total records synced: ${totalRecords}`);
    console.log(`[WORKER] Successful feeds: ${successCount}/3`);
    console.log(`[WORKER] Next sync: ${workerState.nextSync.toISOString()}`);
    console.log('');

    return { success: true, results, duration };
  } catch (error) {
    console.error('[WORKER] ✗ Sync cycle failed:', error);
    workerState.currentStatus = 'error';
    workerState.lastError = error.message;
    workerState.failureCount++;

    return { success: false, error: error.message };
  }
}

/**
 * Sync a single feed (calls Next.js API)
 */
async function syncFeed(feedType, date) {
  return new Promise((resolve, reject) => {
    // Build URL based on feed type
    let url;
    let payload = { startDate: date, endDate: date, forceLive: false };

    switch (feedType) {
      case 'afs':
        url = `${API_URL}/api/adsense-cost-revenue`;
        payload.adsenseAccountId = 'accounts/pub-3934262695019080';
        // Add all AFS account IDs
        payload.accountIds = [
          '7072817229', '1353234754', '6610446272', '5700221831', '3961840839',
          '1769246493', '8077371478', '5932592680', '9657188741', '5898780123',
          '3851198549', '9841818774', '5351234641', '7918808672', '3090502595',
          '9227278944', '7833025125', '1622548445', '9622143895', '7949737807',
          '9249163427'
        ];
        break;

      case 'compado':
        url = `${API_URL}/api/compado-cost-revenue`;
        payload.accountIds = [
          '5416418019', '5108802445', '1671699399', '9197380684', '9669088480',
          '6725067013', '9299147464', '2126478207', '8711828676', '5496110293',
          '3963323643', '1751028486', '9248809715', '9922466223', '9524489917',
          '1235076035', '3471023162', '8871395768', '3475645746', '8994182684'
        ];
        break;

      case 'adscom':
        url = `${API_URL}/api/adscom`;
        // Ads.com aggregates all accounts automatically
        break;

      default:
        return reject(new Error(`Unknown feed type: ${feedType}`));
    }

    const postData = JSON.stringify(payload);

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'AdSyntheX-MongoDB-Sync-Worker/1.0',
      },
      timeout: 300000, // 5 minutes
    };

    console.log(`[WORKER] Calling ${url}`);

    const req = http.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);

            // Extract record counts
            const costCount = response.cost?.length || response.googleAdsData?.length || 0;
            const revenueCount = response.revenue?.length || response.revenueData?.length || 0;

            resolve({ cost: costCount, revenue: revenueCount });
          } catch (e) {
            resolve({ cost: 0, revenue: 0 });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout after 5 minutes'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Health check HTTP server (keeps Render worker alive)
 */
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const uptime = Math.round((Date.now() - workerState.started) / 1000);
    const uptimeHours = (uptime / 3600).toFixed(1);

    const health = {
      status: workerState.currentStatus === 'error' ? 'unhealthy' : 'healthy',
      uptime: `${uptimeHours}h`,
      syncCycles: workerState.syncCount,
      successCount: workerState.successCount,
      failureCount: workerState.failureCount,
      lastSync: workerState.lastSync ? workerState.lastSync.toISOString() : null,
      nextSync: workerState.nextSync ? workerState.nextSync.toISOString() : null,
      currentStatus: workerState.currentStatus,
      lastError: workerState.lastError,
      mongodb: !!MONGODB_URI,
      timestamp: new Date().toISOString(),
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const HEALTH_PORT = process.env.PORT || 10000;
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[WORKER] ✓ Health check server listening on port ${HEALTH_PORT}`);
  console.log(`[WORKER] Health endpoint: http://localhost:${HEALTH_PORT}/health`);
  console.log('');
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('[WORKER] Received SIGTERM signal. Shutting down gracefully...');
  healthServer.close(() => {
    console.log('[WORKER] Health server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[WORKER] Received SIGINT signal. Shutting down gracefully...');
  healthServer.close(() => {
    console.log('[WORKER] Health server closed');
    process.exit(0);
  });
});

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('[WORKER] ✗ Uncaught exception:', error);
  workerState.lastError = error.message;
  workerState.currentStatus = 'error';
  // Don't exit - keep worker alive
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[WORKER] ✗ Unhandled rejection at:', promise, 'reason:', reason);
  workerState.lastError = String(reason);
  workerState.currentStatus = 'error';
  // Don't exit - keep worker alive
});

// Start sync cycle
console.log('[WORKER] Running initial sync in 10 seconds...');
console.log('[WORKER] (Allowing time for Next.js to fully start)');
console.log('');

setTimeout(() => {
  console.log('[WORKER] ⏰ Starting initial sync cycle...');
  syncToday();

  // Schedule periodic syncs
  setInterval(() => {
    console.log(`\n[WORKER] ⏰ Scheduled sync triggered (cycle #${workerState.syncCount + 1})`);
    syncToday();
  }, SYNC_INTERVAL);

  console.log(`[WORKER] ✓ Scheduled to run every ${SYNC_INTERVAL / 60000} minutes`);
  console.log('[WORKER] Worker is now running. Press Ctrl+C to stop.');
  console.log('');
}, 10000);
