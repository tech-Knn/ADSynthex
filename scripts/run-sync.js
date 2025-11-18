// scripts/run-sync.js
// One-time sync script for Render Cron Jobs
// Calls the MongoDB sync endpoint once and exits

const https = require('https');
const http = require('http');

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[SYNC] ERROR: CRON_SECRET environment variable not set!');
  process.exit(1);
}

if (!API_URL) {
  console.error('[SYNC] ERROR: NEXT_PUBLIC_APP_URL environment variable not set!');
  process.exit(1);
}

function runSync() {
  return new Promise((resolve, reject) => {
    // Remove trailing slash from API_URL to prevent double slashes
    const baseUrl = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const url = `${baseUrl}/api/cron/sync-all-feeds`;
    const isHttps = baseUrl.startsWith('https');
    const protocol = isHttps ? https : http;

    console.log(`[SYNC] ========== Starting MongoDB sync ==========`);
    console.log(`[SYNC] Time: ${new Date().toISOString()}`);
    console.log(`[SYNC] Target: ${url}`);

    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'User-Agent': 'AdSyntheX-CronJob/1.0'
      },
      timeout: 600000 // 10 minutes timeout (initial sync takes longer)
    };

    const req = protocol.request(url, options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const statusEmoji = res.statusCode === 200 ? '✅' : '❌';
        console.log(`[SYNC] ${statusEmoji} HTTP Status: ${res.statusCode}`);

        try {
          const response = JSON.parse(data);
          console.log(`[SYNC] Response:`, JSON.stringify(response, null, 2));

          if (response.success) {
            console.log(`[SYNC] ✓ Sync completed successfully`);

            if (response.results) {
              console.log(`[SYNC] Results:`);
              Object.entries(response.results).forEach(([feed, result]) => {
                console.log(`[SYNC]   ${feed.toUpperCase()}:`);
                console.log(`[SYNC]     - Clicks: ${result.clicks || 0}`);
                console.log(`[SYNC]     - Revenue: ${result.revenue || 0}`);
                console.log(`[SYNC]     - Errors: ${result.errors?.length || 0}`);
                if (result.errors && result.errors.length > 0) {
                  result.errors.forEach(err => console.log(`[SYNC]       ✗ ${err}`));
                }
              });
            }

            console.log(`[SYNC] ========== Sync finished successfully ==========`);
            resolve();
          } else {
            console.error(`[SYNC] ✗ Sync failed:`, response.error || 'Unknown error');
            console.log(`[SYNC] ========== Sync finished with errors ==========`);
            reject(new Error(response.error || 'Sync failed'));
          }
        } catch (e) {
          console.error(`[SYNC] ✗ Failed to parse response:`, e.message);
          console.log(`[SYNC] Raw response (first 500 chars):`, data.substring(0, 500));
          console.log(`[SYNC] ========== Sync finished with errors ==========`);
          reject(e);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[SYNC] ❌ Request failed:`, error.message);
      console.error(`[SYNC] Error details:`, error);
      console.log(`[SYNC] ========== Sync failed ==========`);
      reject(error);
    });

    req.on('timeout', () => {
      console.error(`[SYNC] ⏱️  Request timed out after 10 minutes`);
      req.destroy();
      console.log(`[SYNC] ========== Sync timed out ==========`);
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Run the sync
runSync()
  .then(() => {
    console.log('[SYNC] Exiting with success (code 0)');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[SYNC] Exiting with error (code 1)');
    process.exit(1);
  });
