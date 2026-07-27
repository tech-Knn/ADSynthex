#!/usr/bin/env node

// Render cron entrypoint. Hits the AA cache-warmer endpoint so the
// androidadvice_aggregated:* Redis key stays fresh for the dashboard.
// Configure Render to run this every 12 minutes.

const http = require('http');
const https = require('https');

const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  console.error('[WARM_AA] CRON_SECRET env var missing — cannot authorize warmer call');
  process.exit(1);
}

const endpoint = new URL('/api/cron/warm-androidadvice', APP_URL);
const client = endpoint.protocol === 'https:' ? https : http;

const started = Date.now();
console.log(`[WARM_AA] ${new Date().toISOString()} POST ${endpoint.href}`);

const req = client.request(
  {
    hostname: endpoint.hostname,
    port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
    path: endpoint.pathname,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
      'Content-Length': 0,
      'User-Agent': 'AdSyntheX-AA-Warmer/1.0',
    },
    timeout: 120000,
  },
  (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      const ms = Date.now() - started;
      console.log(`[WARM_AA] status=${res.statusCode} in ${ms}ms`);
      console.log(body.slice(0, 500));
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  },
);

req.on('error', (err) => {
  console.error(`[WARM_AA] request failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('[WARM_AA] request timeout after 120s');
  req.destroy();
  process.exit(1);
});

req.end();
