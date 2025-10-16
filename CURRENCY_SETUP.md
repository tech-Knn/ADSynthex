# Currency Exchange Rate Service - Setup Guide

## 🎯 Overview

This system automatically fetches EUR to USD exchange rates from the **European Central Bank (ECB)** and caches them in Redis for 24 hours.

### Why This Is Needed

- **Problem:** Compado API returns revenue in EUR (€), but Google Ads costs are in USD ($)
- **Impact:** Without conversion, profit/ROI/ROAS calculations are incorrect
- **Solution:** Automatic daily EUR→USD conversion using official ECB rates

---

## 🔒 Security & Privacy

**ECB API is 100% Safe:**
- ✅ **Official EU Government API** - Operated by European Central Bank
- ✅ **Public data only** - We fetch exchange rates (no user data sent)
- ✅ **No authentication** - No API keys, zero tracking
- ✅ **GDPR compliant** - EU government source
- ✅ **Read-only** - We only receive data, never send any

**API Endpoint:**
```
https://data.ecb.europa.eu/data-detail-api/EXR.D.USD.EUR.SP00.A
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│           Currency Exchange Rate Flow               │
└─────────────────────────────────────────────────────┘

Daily Cron Job (6 AM UTC)
       ↓
POST /api/currency/refresh
       ↓
Fetch from ECB API
       ↓
Cache in Redis (24h TTL)
       ↓
Your App reads from cache
       ↓
If cache miss → Auto-fetch from ECB → Cache again
       ↓
If ECB fails → Use fallback rate (1.09)
```

### Cache Strategy (3-Tier)

1. **In-Memory Cache** (fastest - 0ms)
   - Expires when server restarts
   - Used for repeated calls in same request

2. **Redis Cache** (fast - ~200ms)
   - Persists across server restarts
   - TTL: 24 hours
   - Shared across all app instances

3. **ECB API** (slow - ~2-5s)
   - Only called on cache miss
   - Rate limited to 1 call per minute (safety)

---

## 📦 Installation & Setup

### Prerequisites

✅ Redis must be installed and configured (see `REDIS_SETUP.md`)
✅ Upstash Redis credentials in `.env.local`

### Step 1: Verify Redis Connection

Your `.env.local` should have:

```bash
# Redis Configuration (Upstash)
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYxxxxxxxxxxxxxxxxxxxxxxx
REDIS_ENABLED=true
```

### Step 2: Test the Currency Service

**Test Locally:**

```bash
# Start your Next.js server
npm run dev

# Test GET endpoint (check current rate)
curl http://localhost:3000/api/currency/refresh

# Test POST endpoint (force refresh from ECB)
curl -X POST http://localhost:3000/api/currency/refresh
```

**Expected Response (GET):**

```json
{
  "success": true,
  "currentRate": 1.0945,
  "cache": {
    "inMemory": {
      "cached": true,
      "rate": 1.0945,
      "source": "ecb"
    },
    "redis": {
      "cached": true,
      "rate": 1.0945,
      "source": "ecb",
      "ttl": 86340
    }
  },
  "timestamp": "2025-10-10T06:00:00.000Z",
  "message": "Current rate: 1 EUR = 1.0945 USD"
}
```

**Expected Response (POST - Force Refresh):**

```json
{
  "success": true,
  "rate": 1.0945,
  "source": "ecb",
  "message": "Successfully fetched rate from ECB: 1 EUR = 1.0945 USD",
  "error": null,
  "cache": { ... },
  "timestamp": "2025-10-10T06:00:00.000Z"
}
```

---

## ⏰ Cron Job Setup

### Option 1: Render Cron Job (Recommended for Render deployment)

1. Go to your Render dashboard
2. Create a new **Cron Job**
3. Configure:
   - **Name:** `currency-rate-refresh`
   - **Schedule:** `0 6 * * *` (Daily at 6 AM UTC)
   - **Command:**
     ```bash
     curl -X POST https://your-app.onrender.com/api/currency/refresh
     ```
4. Click **Create Cron Job**

### Option 2: Vercel Cron (For Vercel deployment)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/currency/refresh",
      "schedule": "0 6 * * *"
    }
  ]
}
```

### Option 3: External Cron Service (For any deployment)

Use services like:
- **EasyCron** (https://www.easycron.com/) - Free tier available
- **cron-job.org** (https://cron-job.org/) - Free, reliable
- **GitHub Actions** - See example below

**GitHub Actions Example:**

Create `.github/workflows/currency-refresh.yml`:

```yaml
name: Daily Currency Rate Refresh

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:     # Allow manual trigger

jobs:
  refresh-currency:
    runs-on: ubuntu-latest
    steps:
      - name: Refresh Currency Rate
        run: |
          curl -X POST https://your-app.onrender.com/api/currency/refresh
```

### Option 4: Server-side Cron (For VPS/Dedicated servers)

Add to crontab:

```bash
# Open crontab editor
crontab -e

# Add this line (runs daily at 6 AM UTC)
0 6 * * * curl -X POST https://your-app.onrender.com/api/currency/refresh
```

---

## 🧪 Testing

### Test 1: Manual Refresh

```bash
# Force refresh exchange rate from ECB
curl -X POST https://your-app.onrender.com/api/currency/refresh
```

**Expected Output:**
- `success: true`
- `source: "ecb"`
- `rate`: Current EUR/USD rate (e.g., 1.0945)

### Test 2: Check Cache Status

```bash
# Get current cached rate
curl https://your-app.onrender.com/api/currency/refresh
```

**Expected Output:**
- Shows current rate
- Shows cache status (in-memory + Redis)
- Shows TTL (time remaining in cache)

### Test 3: Verify Logs

Check your server logs for:

```
[CURRENCY] 🔄 Force refresh initiated...
[CURRENCY] 📊 ECB API success: 1 EUR = 1.0945 USD
[CURRENCY] 💾 Cached rate: 1.0945 (source: ecb, TTL: 86400s)
[CURRENCY] ✅ Force refresh successful: 1.0945 USD/EUR (source: ecb)
```

### Test 4: Test Fallback (Optional)

Temporarily disable Redis to test fallback:

```bash
# Set REDIS_ENABLED=false in .env.local
REDIS_ENABLED=false

# Restart server and test
curl -X POST http://localhost:3000/api/currency/refresh
```

**Expected:** Should use fallback rate (1.09) if ECB fails

---

## 📊 Monitoring

### Check System Health

```bash
# Get current status
curl https://your-app.onrender.com/api/currency/refresh
```

**Important Metrics:**

- **`cache.redis.cached`**: Should be `true` (Redis working)
- **`cache.redis.source`**: Should be `"ecb"` (not fallback)
- **`cache.redis.ttl`**: Should be between 0-86400 (24 hours in seconds)
- **`currentRate`**: Should be between 0.8-1.5 (sanity check)

### Redis Dashboard

View cached rate in Upstash Console:

1. Go to [Upstash Console](https://console.upstash.com/)
2. Select your database
3. Click **Data Browser**
4. Search for key: `currency:eur-to-usd:v1`

**Expected Value:**
```json
{
  "rate": 1.0945,
  "source": "ecb",
  "fetchedAt": "2025-10-10T06:00:00.000Z",
  "expiresAt": "2025-10-11T06:00:00.000Z"
}
```

---

## 🔧 Configuration

### Environment Variables

| Variable                     | Required | Default | Description                        |
|------------------------------|----------|---------|-------------------------------------|
| `UPSTASH_REDIS_REST_URL`     | Yes      | -       | Upstash Redis URL                  |
| `UPSTASH_REDIS_REST_TOKEN`   | Yes      | -       | Upstash Redis token                |
| `REDIS_ENABLED`              | No       | `true`  | Enable/disable Redis               |

### Service Configuration

Edit `lib/currency-service.ts` if needed:

```typescript
const CONFIG = {
  CACHE_TTL_SECONDS: 24 * 60 * 60,    // 24 hours
  FALLBACK_RATE: 1.09,                // Fallback if ECB fails
  MIN_RATE: 0.80,                     // Sanity check minimum
  MAX_RATE: 1.50,                     // Sanity check maximum
  ECB_TIMEOUT_MS: 10000,              // 10 second timeout
  MIN_FETCH_INTERVAL_MS: 60000,       // 1 minute rate limit
}
```

---

## 🚨 Troubleshooting

### Issue 1: ECB API Fails

**Symptoms:**
```
[CURRENCY] ❌ ECB API error: 500 - Request failed
[CURRENCY] ⚠️ Using emergency fallback: 1.09
```

**Solutions:**
1. Check if ECB API is down: https://data.ecb.europa.eu/
2. Verify network/firewall allows HTTPS to ecb.europa.eu
3. Check logs for specific error message
4. System will automatically use fallback rate (1.09)

### Issue 2: Redis Not Working

**Symptoms:**
```
[CURRENCY] ⚠️ Failed to cache in Redis, using in-memory only
```

**Solutions:**
1. Verify Redis credentials in `.env.local`
2. Check Redis connection: See `REDIS_SETUP.md`
3. Check Upstash dashboard for database status
4. System will still work using in-memory cache

### Issue 3: Rate Seems Wrong

**Symptoms:**
- Rate is stuck at 1.09 (fallback)
- Rate hasn't updated in days

**Solutions:**
1. Manually trigger refresh:
   ```bash
   curl -X POST https://your-app.onrender.com/api/currency/refresh
   ```
2. Check cron job is running:
   - Render: Check Cron Jobs dashboard
   - Vercel: Check deployment logs
   - GitHub Actions: Check workflow runs
3. Clear cache and fetch fresh:
   ```typescript
   import { currencyService } from '@/lib/currency-service';
   await currencyService.clearCache();
   await currencyService.forceRefresh();
   ```

### Issue 4: Too Many API Calls

**Symptoms:**
```
[CURRENCY] Rate limit: Wait 45s before next attempt
```

**Solutions:**
- This is normal - prevents hammering ECB API
- Cache should prevent this in production
- Wait 60 seconds between manual refresh attempts

---

## 📈 Performance Metrics

### Expected Performance

| Operation                | Speed    | Frequency       |
|--------------------------|----------|-----------------|
| In-memory cache hit      | 0-1ms    | 90% of requests |
| Redis cache hit          | 50-200ms | 9% of requests  |
| ECB API fetch            | 2-5s     | 1% of requests  |
| Fallback rate (error)    | 0ms      | Only on failure |

### Daily Resource Usage

**ECB API Calls:**
- Normal: 1-2 calls per day (cron + cache misses)
- Heavy: 10-20 calls per day (cache clears, restarts)
- Limit: ~1400 calls per day (1 per minute max)

**Redis Operations:**
- ~10-50 operations per day
- Well within Upstash free tier (10,000/day)

---

## 💰 Cost Breakdown

**ECB API:**
- ✅ **FREE** - Unlimited, no rate limits, EU government operated

**Redis Storage:**
- Cache size: ~200 bytes
- TTL: 24 hours
- Cost: **FREE** (Upstash free tier: 256 MB storage)

**Total Cost:** **$0.00** 🎉

---

## 🔄 Manual Operations

### Force Update Exchange Rate

```bash
curl -X POST https://your-app.onrender.com/api/currency/refresh
```

### Check Current Rate

```bash
curl https://your-app.onrender.com/api/currency/refresh
```

### Clear Cache (Emergency)

```typescript
// In your API route or admin panel
import { currencyService } from '@/lib/currency-service';

// Clear cache
await currencyService.clearCache();

// Fetch fresh rate
const result = await currencyService.forceRefresh();
console.log(`New rate: ${result.rate}`);
```

### Update Fallback Rate

Edit `lib/currency-service.ts`:

```typescript
const CONFIG = {
  FALLBACK_RATE: 1.10, // Update this value
  ...
}
```

Then redeploy your application.

---

## 📚 API Reference

### GET /api/currency/refresh

**Description:** Get current exchange rate and cache status

**Response:**
```json
{
  "success": true,
  "currentRate": 1.0945,
  "cache": {
    "inMemory": { "cached": true, "rate": 1.0945, "source": "ecb" },
    "redis": { "cached": true, "rate": 1.0945, "source": "ecb", "ttl": 86340 }
  },
  "timestamp": "2025-10-10T12:00:00.000Z",
  "message": "Current rate: 1 EUR = 1.0945 USD"
}
```

### POST /api/currency/refresh

**Description:** Force refresh exchange rate from ECB

**Response:**
```json
{
  "success": true,
  "rate": 1.0945,
  "source": "ecb",
  "message": "Successfully fetched rate from ECB: 1 EUR = 1.0945 USD",
  "error": null,
  "cache": { ... },
  "timestamp": "2025-10-10T12:00:00.000Z"
}
```

---

## ✅ Setup Checklist

- [ ] Redis is set up and connected (see `REDIS_SETUP.md`)
- [ ] Environment variables are configured
- [ ] Test GET endpoint works: `curl http://localhost:3000/api/currency/refresh`
- [ ] Test POST endpoint works: `curl -X POST http://localhost:3000/api/currency/refresh`
- [ ] Cron job is configured (daily 6 AM UTC)
- [ ] First manual refresh completed successfully
- [ ] Verified rate is cached in Redis (check Upstash dashboard)
- [ ] Logs show ECB API success
- [ ] Compado integration uses dynamic rates

---

## 🎯 Success Criteria

Your currency service is working correctly when:

1. ✅ GET endpoint returns current rate with `cache.redis.cached: true`
2. ✅ Source is `"ecb"` (not `"fallback"`)
3. ✅ Rate is between 0.8 - 1.5 (reasonable EUR/USD range)
4. ✅ Cache TTL is between 0-86400 seconds
5. ✅ Logs show: `[CURRENCY] ✅ Redis cache hit: X.XXXX (ecb)`
6. ✅ Cron job runs successfully every day at 6 AM UTC
7. ✅ No ECB API errors in logs

---

## 📞 Support

**Need Help?**
- Check logs for `[CURRENCY]` messages
- Visit health endpoint: `GET /api/currency/refresh`
- Check Upstash dashboard for Redis status
- Review ECB API status: https://data.ecb.europa.eu/

**Common Log Messages:**

| Message | Meaning |
|---------|---------|
| `⚡ In-memory cache hit` | Fastest path - no network calls |
| `✅ Redis cache hit` | Fast path - no ECB API call |
| `🔄 Cache miss, fetching from ECB` | Slow path - calling ECB API |
| `📊 ECB API success` | Successfully fetched fresh rate |
| `❌ ECB API error` | ECB fetch failed, using fallback |
| `💾 Cached rate` | Rate stored in Redis successfully |
| `🆘 Using emergency fallback` | All systems failed, using hardcoded rate |

---

** Setup Complete!**

Your currency exchange rate service is now fully operational with:
- ✅ Automatic daily updates from ECB
- ✅ 3-tier caching (memory → Redis → ECB)
- ✅ Reliable fallback mechanism
- ✅ Zero cost, production-grade solution
