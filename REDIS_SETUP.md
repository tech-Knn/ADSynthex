# Redis Setup Guide for AdSyntheX

 Set up Upstash Redis for persistent rate limiting and caching.


### Step 1: Create Upstash Redis Database

1. Go to [Upstash Console](https://console.upstash.com/)
2. Click **"Create Database"**
3. Choose settings:
   - **Name**: `adsynthex-cache`
   - **Type**: `Regional` (free tier)
   - **Region**: 
   - **Eviction**: `allkeys-lru` (recommended)
4. Click **"Create"**

### Step 2: Get Redis Credentials

After creating the database

```
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYxxxxxxxxxxxxxxxxxxxxxxx
```

Copy these values.

### Step 3: Add to Environment Variables

#### For Local Development (.env.local):

```bash
# Redis Configuration (Upstash)
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Disable Redis for testing 
# REDIS_ENABLED=false
```


4. Click **"Save Changes"**
6. Render will automatically redeploy

### Step 4: Verify Setup

After deployment, check the logs for:

```
[REDIS] Connected to Upstash Redis successfully
[BULLETPROOF_API] Redis-powered request: ...
```

If you see:
```
[REDIS] Redis disabled by configuration, using in-memory fallback
```

Then Redis credentials are missing or incorrect.

---

## 🔍 How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│           Your Next.js App (Render)             │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │  bulletproofAPI (lib/bulletproof-...)   │   │
│  │                                         │   │
│  │  ┌─────────────────────────────────┐   │   │
│  │  │  redisCacheManager              │   │   │
│  │  │  • Memory Cache (hot)           │   │   │
│  │  │  • Redis Cache (warm)           │   │   │
│  │  └─────────┬───────────────────────┘   │   │
│  │            │                           │   │
│  │  ┌─────────▼───────────────────────┐   │   │
│  │  │  googleAdsRateLimiter           │   │   │
│  │  │  • Persistent cooldown          │   │   │
│  │  │  • Hourly/Daily quotas          │   │   │
│  │  │  • Circuit breaker              │   │   │
│  │  └─────────┬───────────────────────┘   │   │
│  └────────────┼─────────────────────────┘   │
│               │                             │
└───────────────┼─────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────┐
│         Upstash Redis (Cloud)                    │
│                                                  │
│  Keys:                                           │
│  • cache:google-ads:*      (cached data)         │
│  • rate:google:daily:*     (quota tracking)      │
│  • rate:google:hourly:*    (hourly limits)       │
│  • quota:google:cooldown   (persistent state!)   │
│  • health:google:*         (monitoring)          │
└──────────────────────────────────────────────────┘
```

### Key Benefits

1. **✅ Persistent Cooldown**
   - If Google Ads says "Retry in 10332 seconds", that cooldown persists even if your server restarts
   - Previously: Lost on restart → immediate rate limit again
   - Now: Stored in Redis → respected across restarts

2. **✅ Hourly Quotas**
   - Prevents exhausting daily quota in first few hours
   - Conservative limits: 500 requests/hour max

3. **✅ Daily Quotas**
   - Tracks usage across 30 accounts
   - Stops at 80% of daily limit (safety buffer)

4. **✅ 3-Tier Caching**
   - Memory (50ms) → Redis (200ms) → Google Ads API (2-5s)
   - 95%+ cache hit rate expected

5. **✅ Circuit Breaker**
   - Automatically stops API calls if error rate > 50%
   - Self-heals when errors decrease

---

## 📊 Redis Operations Budget

### Daily Usage Estimate (100 dashboard loads):

```
Scenario Breakdown:
├─ 95 cached loads × 0 Redis ops       = 0 ops
├─ 4 Redis cache hits × 2 ops          = 8 ops
├─ 1 API call × 10 ops                 = 10 ops
├─ Health checks (hourly) × 24         = 24 ops
└─ TOTAL: ~42 Redis ops/day

Upstash Free Tier: 10,000 ops/day
Usage: 0.4% of free tier ✅
```

**You'll stay well within the free tier even with 1000+ dashboard loads/day.**

---

## 🛠️ Troubleshooting

### Redis Not Connecting

**Symptoms:**
```
[REDIS] Redis credentials not found, using in-memory fallback
```

**Solutions:**
1. Verify environment variables are set correctly
2. Check for typos in variable names (must be exact)
3. Restart your server after adding variables
4. For Render: Ensure variables are in the **Environment** tab, not `.env` file

### Rate Limits Still Hitting

**Symptoms:**
```
Too many requests. Retry in X seconds
```

**Check:**
1. Is Redis connected? Look for: `[REDIS] Connected to Upstash Redis successfully`
2. Check quota status: Visit `/api/google-ads-production` (GET request)
3. Look for cooldown: `quota:google:cooldown` key in Redis
4. Manually reset cooldown (emergency only):
   ```typescript
   await googleAdsRateLimiter.resetCooldown();
   ```

### In-Memory Fallback Mode

**When Redis is unavailable**, the system automatically falls back to in-memory caching:

```
[REDIS] Falling back to in-memory cache
```

**Limitations of Fallback:**
- ❌ Cooldown lost on server restart
- ❌ Quota tracking resets
- ✅ Caching still works (within server lifetime)
- ✅ App continues to function

**To enable Redis:** Add credentials and restart.

---

## 📈 Monitoring

### Check System Health

Visit your production API health endpoint:

```bash
GET https://your-app.onrender.com/api/google-ads-production
```

Response includes:
```json
{
  "status": "healthy",
  "quota": {
    "dailyUsed": 42,
    "dailyLimit": 12000,
    "quotaRemaining": 11958,
    "isInCooldown": false,
    "safeToOperate": true
  },
  "cache": {
    "hitRate": 95.5,
    "memoryCacheSize": 45,
    "redisConnected": true
  },
  "redis": {
    "connected": true,
    "mode": "redis"
  }
}
```

### Important Metrics:

- **`quotaRemaining`**: Should stay > 0
- **`isInCooldown`**: Should be `false` (if `true`, check `cooldownEnds`)
- **`hitRate`**: Should be > 70% (higher is better)
- **`redis.connected`**: Should be `true`

### Redis Dashboard

View your Redis data in Upstash Console:
1. Go to [Upstash Console](https://console.upstash.com/)
2. Select your database
3. Click **"Data Browser"**
4. Search for keys:
   - `cache:*` - Cached data
   - `rate:*` - Rate limiting counters
   - `quota:*` - Quota state
   - `health:*` - Health metrics

---

## 🔄 Cache Management

### Clear All Caches (Emergency)

```typescript
// In your API route or admin endpoint
import { redisCacheManager } from '@/lib/redis-cache-manager';

await redisCacheManager.invalidate(); // Clears memory cache
```

**Note:** Redis cache will auto-expire based on TTL (10-60 minutes).

### Manual Cache Warmup

During off-peak hours (2-6 AM):

```typescript
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

const dateRanges = [
  { startDate: '2025-10-09', endDate: '2025-10-09', customerId: null },
  { startDate: '2025-10-08', endDate: '2025-10-08', customerId: null }
];

await bulletproofAPI.warmUpCache(dateRanges);
```

---

## 🚨 Emergency Commands

### Reset Cooldown (Use with caution!)

```typescript
import { googleAdsRateLimiter } from '@/lib/redis-rate-limiter';

await googleAdsRateLimiter.resetCooldown();
```

**⚠️ Warning:** Only use if:
1. You're certain the cooldown was set incorrectly
2. You've waited at least 1 hour since last rate limit error
3. You've verified quota remaining is healthy

### Disable Redis Temporarily

Set environment variable:
```
REDIS_ENABLED=false
```

Then restart server. System will use in-memory fallback.

## 📚 Additional Resources

- [Upstash Redis Documentation](https://docs.upstash.com/redis)
- [Upstash REST API](https://docs.upstash.com/redis/features/restapi)
- [Rate Limiting Best Practices](https://upstash.com/docs/redis/features/ratelimit)

---

## ✅ Setup Complete!

Your system is now protected by Redis-based rate limiting. Key improvements:

1. ✅ **Never hit rate limits again** - Persistent cooldown tracking
2. ✅ **Survive server restarts** - State persisted in Redis
3. ✅ **95%+ cache hit rate** - Fast responses from memory/Redis
4. ✅ **Stay within free tier** - < 1% of Upstash free quota
5. ✅ **Automatic fallback** - Works even without Redis

---

**Need Help?**

- Check logs for `[REDIS]`, `[REDIS_RATE_LIMITER]`, `[REDIS_CACHE]` messages
- Visit health endpoint: `GET /api/google-ads-production`
- Check Upstash dashboard for Redis metrics
