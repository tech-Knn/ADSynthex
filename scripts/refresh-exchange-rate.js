#!/usr/bin/env node

/**
 * Exchange Rate Refresh Script for Render Cron Job
 *
 * This script runs daily to refresh the EUR/USD exchange rate
 * Usage: node scripts/refresh-exchange-rate.js
 */

const https = require('https');

// Get the deployed app URL from environment variable
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const REFRESH_ENDPOINT = `${APP_URL}/api/currency/refresh`;

console.log('[CRON] 🕐 Starting exchange rate refresh...');
console.log(`[CRON] Target: ${REFRESH_ENDPOINT}`);
console.log(`[CRON] Timestamp: ${new Date().toISOString()}`);

// Make HTTP POST request to refresh endpoint
const url = new URL(REFRESH_ENDPOINT);
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'Render-Cron-Job/1.0'
  },
  timeout: 30000 // 30 second timeout
};

const protocol = url.protocol === 'https:' ? https : require('http');

const req = protocol.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log(`[CRON] Response status: ${res.statusCode}`);

    try {
      const result = JSON.parse(data);

      if (result.success) {
        console.log(`[CRON] ✅ SUCCESS: 1 EUR = ${result.rate} USD (${result.source})`);
        console.log(`[CRON] Cache updated successfully`);
        process.exit(0);
      } else {
        console.warn(`[CRON] ⚠️ FALLBACK: ${result.message}`);
        console.warn(`[CRON] Error: ${result.error}`);
        process.exit(0); // Exit 0 even on fallback (not a critical failure)
      }
    } catch (error) {
      console.error('[CRON] ❌ Failed to parse response:', error.message);
      console.error('[CRON] Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('[CRON] ❌ Request failed:', error.message);
  process.exit(1);
});

req.on('timeout', () => {
  console.error('[CRON] ❌ Request timeout (30s)');
  req.destroy();
  process.exit(1);
});

req.end();
