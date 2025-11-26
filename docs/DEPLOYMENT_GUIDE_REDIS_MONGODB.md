# Deployment Guide: Redis + MongoDB Architecture
**Date:** November 21, 2025
**Version:** 1.0

This guide walks you through deploying the new dual-layer caching system with Redis + MongoDB.

---

## Prerequisites

Before starting, ensure you have:

- [x] MongoDB Atlas account (free or paid)
- [x] Render account
- [x] Upstash Redis ($20/month plan)
- [x] All API credentials (Google Ads, AdSense, Compado, Ads.com)
- [x] Git repository access

---

## Step 1: Set Up MongoDB Atlas

### 1.1 Create MongoDB Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Build a Database"**
3. Select plan:
   - **FREE (M0)**: 512MB - Good for testing only
   - **RECOMMENDED: M2 Shared**: 2GB - $9/month
4. Choose region: **Same as your Render region** (e.g., US East)
5. Cluster name: `adsynthex-cluster`
6. Click **"Create"**

### 1.2 Create Database User

1. Go to **Database Access**
2. Click **"Add New Database User"**
3. Authentication Method: **Password**
4. Username: `adsynthex_user`
5. Password: **Generate secure password** (save it!)
6. Database User Privileges: **Read and write to any database**
7. Click **"Add User"**

### 1.3 Configure Network Access

1. Go to **Network Access**
2. Click **"Add IP Address"**
3. Select **"Allow Access from Anywhere"** (0.0.0.0/0)
   - This is safe because we use username/password authentication
4. Click **"Confirm"**

### 1.4 Get Connection String

1. Go to **Database** → **Connect**
2. Choose **"Connect your application"**
3. Driver: **Node.js**, Version: **5.5 or later**
4. Copy the connection string:
   ```
   mongodb+srv://adsynthex_user:<password>@adsynthex-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Add database name after `.net/`: `...mongodb.net/adsynthex?retryWrites=...`

**Final connection string example:**
```
mongodb+srv://adsynthex_user:MyP@ssw0rd123@adsynthex-cluster.abc123.mongodb.net/adsynthex?retryWrites=true&w=majority&appName=adsynthex-cluster
```

---

## Step 2: Update Environment Variables

### 2.1 Local Development (.env.local)

Add MongoDB connection string to your `.env.local`:

```bash
# MongoDB
MONGODB_URI=mongodb+srv://adsynthex_user:YourPassword@adsynthex-cluster.xxxxx.mongodb.net/adsynthex?retryWrites=true&w=majority&appName=adsynthex-cluster

# Existing vars...
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...
# ... rest of your vars
```

### 2.2 Test Local Connection

Run this to verify MongoDB connection:

```bash
node -e "const { MongoClient } = require('mongodb'); new MongoClient(process.env.MONGODB_URI).connect().then(() => console.log('✓ Connected')).catch(e => console.error('✗ Failed:', e.message));"
```

You should see: `✓ Connected`

---

## Step 3: Deploy to Render

### 3.1 Push Code to GitHub

```bash
git add .
git commit -m "Add Redis + MongoDB dual-layer caching architecture"
git push origin main
```

### 3.2 Update Render Environment Variables

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Select your **adsynthex-web** service
3. Go to **Environment** tab
4. Add new environment variable:
   - Key: `MONGODB_URI`
   - Value: `mongodb+srv://adsynthex_user:...` (your connection string)
5. Click **"Save Changes"**

### 3.3 Add MongoDB Worker Service

The `render.yaml` file now includes a MongoDB sync worker. Render will automatically create it.

**Verify in Render Dashboard:**
1. You should see a new service: **mongodb-sync-worker**
2. Type: **Background Worker**
3. Status: **Live** (green)

If you don't see it:
1. Go to **Dashboard** → **New** → **Background Worker**
2. Connect your repository
3. Name: `mongodb-sync-worker`
4. Build Command: `npm install`
5. Start Command: `node scripts/mongodb-sync-worker.js`
6. Add all environment variables (same as web service)

---

## Step 4: Initialize MongoDB

### 4.1 Run Setup Endpoint

Once deployed, run this command to create MongoDB indexes:

```bash
curl -X POST https://adsynthex.onrender.com/api/setup-mongodb \
  -H "Content-Type: application/json" \
  -d '{"secret":"YOUR_CRON_SECRET"}'
```

Replace `YOUR_CRON_SECRET` with your actual CRON_SECRET from environment variables.

**Expected Response:**
```json
{
  "success": true,
  "message": "MongoDB setup completed successfully",
  "connection": {
    "connected": true,
    "database": "adsynthex",
    "collections": 0,
    "dataSize": "0.00 MB"
  },
  "health": {
    "status": "healthy",
    "connected": true
  }
}
```

### 4.2 Verify Worker is Running

Check worker health:

```bash
curl https://mongodb-sync-worker.onrender.com/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "uptime": "0.2h",
  "syncCycles": 1,
  "successCount": 3,
  "failureCount": 0,
  "lastSync": "2025-11-21T10:15:00Z",
  "nextSync": "2025-11-21T10:30:00Z",
  "currentStatus": "idle",
  "mongodb": true
}
```

---

## Step 5: Monitor First Sync

### 5.1 Check Worker Logs

1. Go to Render Dashboard
2. Select **mongodb-sync-worker** service
3. Click **"Logs"** tab
4. Watch for sync cycle:

```
╔══════════════════════════════════════════════════════════════╗
║         SYNC CYCLE STARTED                                    ║
╚══════════════════════════════════════════════════════════════╝

[WORKER] ========== Syncing AFS ==========
[WORKER] Calling https://adsynthex.onrender.com/api/adsense-cost-revenue
[WORKER] ✅ AFS sync successful

[WORKER] ========== Syncing COMPADO ==========
[WORKER] ✅ compado sync successful

[WORKER] ========== Syncing ADSCOM ==========
[WORKER] ✅ adscom sync successful

╔══════════════════════════════════════════════════════════════╗
║         SYNC CYCLE COMPLETED                                  ║
╚══════════════════════════════════════════════════════════════╝
[WORKER] Duration: 180s
[WORKER] Total records synced: 1523
[WORKER] Successful feeds: 3/3
[WORKER] Next sync: 2025-11-21T10:30:00Z
```

### 5.2 Verify Data in MongoDB

1. Go to MongoDB Atlas
2. Select your cluster
3. Click **"Browse Collections"**
4. You should see 9 collections:
   - `afs_cost`
   - `afs_revenue`
   - `compado_cost`
   - `compado_revenue`
   - `adscom_cost`
   - `adscom_revenue`
   - `sync_status`
   - `sync_history`
   - `data_snapshots`

5. Click on `afs_cost` → You should see documents with today's data

---

## Step 6: Test Dashboard Performance

### 6.1 Test Today's Data (Redis Cache)

1. Open your dashboard: `https://adsynthex.onrender.com/dashboard`
2. Select **"Today"** date range
3. **Expected load time:** <200ms
4. Check browser console for source:
   ```
   [SMART_FETCH] Hot data query - checking Redis cache
   [SMART_FETCH] ✅ Redis cache HIT (85ms)
   ```

### 6.2 Test Historical Data (MongoDB)

1. Select **"Last 30 days"** date range
2. **Expected load time:** <1 second
3. Check console:
   ```
   [SMART_FETCH] Warm data query - querying MongoDB
   [SMART_FETCH] ✅ MongoDB HIT (420ms) - 1250 cost, 980 revenue
   ```

### 6.3 Test Old Data (API + Save)

1. Select a date range from **3 months ago**
2. **First time:** 30-60 seconds (API call + save to MongoDB)
3. **Second time (same range):** <1 second (MongoDB)
4. Check console:
   ```
   First query:
   [SMART_FETCH] Cold data query - fetching from API (will cache)
   [SMART_FETCH] ✓ Saved to MongoDB - future queries will be fast

   Second query:
   [SMART_FETCH] Warm data query - querying MongoDB
   [SMART_FETCH] ✅ MongoDB HIT (510ms)
   ```

---

## Step 7: Verify Data Consistency

Run data consistency check:

```bash
curl -X POST https://adsynthex.onrender.com/api/verify-consistency \
  -H "Content-Type: application/json" \
  -d '{"feed":"afs","date":"2025-11-21","secret":"YOUR_CRON_SECRET"}'
```

**Expected Response:**
```json
{
  "success": true,
  "feed": "afs",
  "date": "2025-11-21",
  "consistency": {
    "valid": true,
    "difference": 0,
    "individualTotal": 1523450000,
    "overallTotal": 1523450000
  }
}
```

---

## Troubleshooting

### Issue: Worker Not Syncing

**Symptoms:**
- Worker logs show no sync cycles
- Health endpoint returns `syncCount: 0`

**Solution:**
1. Check worker logs for errors
2. Verify `NEXT_PUBLIC_APP_URL` is correct
3. Verify `MONGODB_URI` is set
4. Restart worker service in Render

### Issue: MongoDB Connection Failed

**Symptoms:**
- Setup endpoint returns "MongoDB connection failed"
- Worker logs show connection errors

**Solution:**
1. Check MongoDB Atlas **Network Access** allows 0.0.0.0/0
2. Verify connection string format (includes `/adsynthex`)
3. Check username/password are correct
4. Try connection string in local environment first

### Issue: Slow Dashboard Loads

**Symptoms:**
- Dashboard takes >5 seconds to load even for today's data
- Redis cache misses frequently

**Solution:**
1. Check Redis connection (environment vars)
2. Verify worker is running (syncs every 15 min)
3. Check `sync_status` collection in MongoDB
4. Clear Redis cache: `curl -X POST https://adsynthex.onrender.com/api/clear-cache`

### Issue: Data Inconsistency

**Symptoms:**
- Individual account totals don't match overall total
- Missing data for some accounts

**Solution:**
1. Check `sync_status` collection for failed accounts
2. Review worker logs for error messages
3. Manually resync specific date:
   ```bash
   curl -X POST https://adsynthex.onrender.com/api/manual-sync \
     -H "Content-Type: application/json" \
     -d '{"startDate":"2025-11-21","endDate":"2025-11-21","secret":"..."}'
   ```

---

## Monitoring Checklist

### Daily Checks

- [ ] Worker is **Live** (green) in Render
- [ ] Last sync < 15 minutes ago (check health endpoint)
- [ ] Sync success rate > 95%
- [ ] MongoDB storage < 80% of plan limit

### Weekly Checks

- [ ] Review sync error logs
- [ ] Check data consistency for past week
- [ ] Verify API quota usage < 8,000/day
- [ ] Review MongoDB performance insights

### Monthly Checks

- [ ] Archive old data (>90 days) if needed
- [ ] Review and optimize MongoDB indexes
- [ ] Check cost trends ($43/month expected)
- [ ] Performance audit (load times)

---

## Rollback Plan

If something goes wrong, rollback to Redis-only:

### Quick Rollback (5 minutes)

1. **Disable MongoDB worker:**
   - Go to Render → mongodb-sync-worker
   - Click **"Suspend"**

2. **Remove MONGODB_URI:**
   - Go to Render → adsynthex-web → Environment
   - Delete `MONGODB_URI` variable
   - Save changes

3. **Redeploy previous version:**
   ```bash
   git revert HEAD
   git push origin main
   ```

4. **Verify:**
   - Dashboard should work (slower for historical data)
   - Redis-only mode active

---

## Success Metrics

After 24 hours of operation, verify:

| Metric | Target | How to Check |
|--------|--------|--------------|
| **Worker Uptime** | >99% | Health endpoint |
| **Sync Success Rate** | >95% | sync_status collection |
| **Dashboard Load (Today)** | <200ms | Browser dev tools |
| **Dashboard Load (Last Month)** | <1s | Browser dev tools |
| **API Calls/Day** | <8,000 | Google Ads quota page |
| **MongoDB Size** | <500MB | Atlas dashboard |

---

## Next Steps

After successful deployment:

1. ✅ Monitor for 48 hours
2. ✅ Set up alerts (Render + MongoDB Atlas)
3. ✅ Document any custom changes
4. ✅ Train team on new architecture
5. ✅ Plan data retention strategy (archive >90 days)

---

## Support

If you encounter issues:

1. Check this guide's **Troubleshooting** section
2. Review `2025-11-21_REDIS_MONGODB_CACHING_ARCHITECTURE.prd` for architecture details
3. Check worker logs in Render
4. Check MongoDB Atlas logs

---

**END OF DEPLOYMENT GUIDE**
