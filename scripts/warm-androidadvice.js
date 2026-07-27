#!/usr/bin/env node

// Render cron entrypoint. POSTs directly to /api/adsense-cost-revenue so the
// androidadvice_aggregated:* Redis key stays fresh for the dashboard.
// Bypasses cookie auth via the CRON_SECRET bearer that middleware.ts recognizes.
// Configure Render to run this every 12 minutes.

const http = require('http');
const https = require('https');

const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[WARM_AA] CRON_SECRET env var missing');
  process.exit(1);
}

// Same 18 AA accounts the dashboard sends in app/androidadvice/page.tsx.
const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

function todayUTC() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

const today = todayUTC();
const payload = JSON.stringify({
  startDate: today,
  endDate: today,
  adsenseAccountType: 'androidadvice',
  accountIds: AA_ACCOUNT_IDS,
  forceLive: false,
});

const endpoint = new URL('/api/adsense-cost-revenue', APP_URL);
const client = endpoint.protocol === 'https:' ? https : http;

const started = Date.now();
console.log(`[WARM_AA] ${new Date().toISOString()} POST ${endpoint.href} (${today})`);

const req = client.request(
  {
    hostname: endpoint.hostname,
    port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
    path: endpoint.pathname,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'AdSyntheX-AA-Warmer/1.0',
    },
    timeout: 180000,
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      const ms = Date.now() - started;
      let source = 'unknown';
      let totalRevenue;
      let totalCost;
      try {
        const parsed = JSON.parse(body);
        source = parsed._source ?? parsed.error ?? 'unknown';
        totalRevenue = parsed.summary?.totalRevenue;
        totalCost = parsed.summary?.totalCost;
      } catch { /* non-JSON */ }
      console.log(`[WARM_AA] status=${res.statusCode} in ${ms}ms source=${source} cost=${totalCost} revenue=${totalRevenue}`);
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  },
);

req.on('error', (err) => {
  console.error(`[WARM_AA] request failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('[WARM_AA] timeout after 180s');
  req.destroy();
  process.exit(1);
});

req.write(payload);
req.end();
