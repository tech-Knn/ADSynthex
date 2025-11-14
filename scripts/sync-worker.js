// scripts/sync-worker.js
// Background Worker for Render - Runs sync job every 30 minutes

const https = require('https');
const http = require('http');

const SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes
const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[WORKER] ERROR: CRON_SECRET environment variable not set!');
  process.exit(1);
}

function runSync() {
  const url = `${API_URL}/api/cron/sync-all-feeds`;
  const isHttps = API_URL.startsWith('https');
  const protocol = isHttps ? https : http;

  console.log(`[WORKER] ========== Starting sync at ${new Date().toISOString()} ==========`);
  console.log(`[WORKER] Target URL: ${url}`);

  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${CRON_SECRET}`,
      'User-Agent': 'AdSyntheX-Worker/1.0'
    },
    timeout: 300000 // 5 minutes timeout
  };

  const req = protocol.request(url, options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      const statusEmoji = res.statusCode === 200 ? '✅' : '❌';
      console.log(`[WORKER] ${statusEmoji} Sync completed with status: ${res.statusCode}`);

      try {
        const response = JSON.parse(data);
        console.log(`[WORKER] Response:`, JSON.stringify(response, null, 2));

        if (response.success) {
          console.log(`[WORKER] ✓ Sync successful`);
          if (response.results) {
            Object.entries(response.results).forEach(([feed, result]) => {
              console.log(`[WORKER]   ${feed}: ${result.clicks} clicks, ${result.revenue} revenue, ${result.errors?.length || 0} errors`);
            });
          }
        } else {
          console.error(`[WORKER] ✗ Sync failed:`, response.error);
        }
      } catch (e) {
        console.log(`[WORKER] Response (raw): ${data.substring(0, 500)}`);
      }

      console.log(`[WORKER] ========== Sync finished at ${new Date().toISOString()} ==========\n`);
    });
  });

  req.on('error', (error) => {
    console.error(`[WORKER] ❌ Sync request failed:`, error.message);
    console.error(`[WORKER] Error details:`, error);
  });

  req.on('timeout', () => {
    console.error(`[WORKER] ⏱️  Sync request timed out after 5 minutes`);
    req.destroy();
  });

  req.end();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[WORKER] Received SIGTERM signal. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[WORKER] Received SIGINT signal. Shutting down gracefully...');
  process.exit(0);
});

// Health check endpoint (optional, for Render health checks)
const healthCheckServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      lastSync: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const HEALTH_PORT = process.env.PORT || 10000;
healthCheckServer.listen(HEALTH_PORT, () => {
  console.log(`[WORKER] Health check server listening on port ${HEALTH_PORT}`);
});

// Start worker
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         AdSyntheX Background Sync Worker Started            ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`[WORKER] API URL: ${API_URL}`);
console.log(`[WORKER] Sync interval: ${SYNC_INTERVAL / 60000} minutes`);
console.log(`[WORKER] Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
console.log(`[WORKER] Current time: ${new Date().toISOString()}`);
console.log('');

// Run sync immediately on startup
console.log('[WORKER] Running initial sync...');
runSync();

// Schedule periodic syncs
setInterval(() => {
  console.log(`[WORKER] ⏰ Scheduled sync triggered`);
  runSync();
}, SYNC_INTERVAL);

console.log(`[WORKER] ✓ Scheduled to run every ${SYNC_INTERVAL / 60000} minutes`);
console.log('[WORKER] Worker is now running. Press Ctrl+C to stop.\n');
