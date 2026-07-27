# Realtime/Daily Data Accuracy - Verification

## Executive Summary

✅ **All changes preserve realtime/daily data accuracy.** The modifications only affect **how we fetch and aggregate** revenue data, not the underlying data itself or caching behavior.

## Data Freshness Guarantees

### Cache TTL Configuration

**Location:** `lib/redis-cache-manager.ts:69-73`

```typescript
'predicto': {
  current: 900,      // 15 minutes for TODAY's data
  recent: 7200,      // 2 hours for yesterday's data
  historical: 43200  // 12 hours for historical data
}
```

### Auto-TTL Detection

**Location:** `lib/redis-cache-manager.ts:506-520`

```typescript
private determineTTL(key: string, dataType): number {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  if (key.includes(today)) {
    return config.current;  // 15 minutes for today
  } else if (key.includes(yesterday)) {
    return config.recent;   // 2 hours for yesterday
  } else {
    return config.historical; // 12 hours for older
  }
}
```

**How it works:**
1. Checks if cache key contains today's date (e.g., `2024-03-08`)
2. If yes → Uses 15-minute TTL (ensures realtime freshness)
3. If yesterday → Uses 2-hour TTL
4. If older → Uses 12-hour TTL

## Data Flow for Daily/Realtime Queries

### Example: Today's Data (Realtime)

**Request:**
```json
{
  "startDate": "2024-03-08", // Today
  "endDate": "2024-03-08",
  "customerId": "2382992113"
}
```

**Cache Key:** `predicto-agg:2382992113:2024-03-08:2024-03-08`

**Processing:**
1. ✅ Checks cache (15-minute TTL for today)
2. ✅ If cache miss or expired → Fetches fresh data from APIs:
   - **Google Ads API** → Cost data (realtime)
   - **Predicto API** → Revenue data (realtime)
3. ✅ Maps cost to revenue by channel IDs
4. ✅ Calculates summary with channel-filtered revenue (single account)
5. ✅ Caches result with 15-minute TTL
6. ✅ Returns fresh data to user

**Data Freshness:** Maximum 15 minutes old

### Example: Multi-Account View (Realtime)

**Request:**
```json
{
  "startDate": "2024-03-08",
  "endDate": "2024-03-08",
  "accountIds": ["2382992113", "1640518611", "8091270364"]
}
```

**Processing:**
1. ✅ Checks cache (15-minute TTL)
2. ✅ If expired → Fetches fresh data:
   - **Google Ads API** → Cost from all 3 accounts
   - **Predicto API (channel-based)** → Revenue by channel
   - **Predicto API (pure)** → Date-only revenue (all accounts)
3. ✅ Uses pure revenue for summary (prevents duplication)
4. ✅ Caches with 15-minute TTL
5. ✅ Returns realtime data

**Data Freshness:** Maximum 15 minutes old

## What Changed vs. What Stayed Same

### ✅ Changed (Optimization)
- **How we fetch** revenue for summary calculation
  - Before: Always fetched pure revenue (all accounts)
  - After: Only fetch pure revenue for multi-account view
- **Which data we use** for summary
  - Single account: Channel-filtered revenue (not all-account pure revenue)
  - Multi-account: Pure revenue (same as before)

### ✅ Unchanged (Data Accuracy)
- ✅ Cache TTL: Still 15 minutes for today's data
- ✅ Google Ads API fetching: No changes
- ✅ Predicto API fetching: No changes to channel-based revenue
- ✅ Cost-revenue mapping: Same channel-based logic
- ✅ Data aggregation: Same per-campaign aggregation
- ✅ Currency conversion: Same USD conversion logic

## Force Refresh for Realtime Data

Users can always force fresh data by using `forceRefresh` parameter:

**Request:**
```json
{
  "startDate": "2024-03-08",
  "endDate": "2024-03-08",
  "customerId": "2382992113",
  "forceRefresh": true  // ← Bypasses cache
}
```

**What happens:**
1. ✅ Bypasses all caching (memory + Redis)
2. ✅ Fetches fresh data directly from APIs
3. ✅ Returns absolutely current data
4. ✅ Updates cache with fresh data

**Use cases:**
- Just updated Google Ads campaigns, need to see changes immediately
- Suspect cache is stale
- Debugging data accuracy issues

## Data Accuracy Verification

### Test 1: Today's Cost Data

```bash
# Test with today's date
curl -X POST http://localhost:3000/api/predicto-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-03-08",
    "endDate": "2024-03-08",
    "customerId": "2382992113",
    "forceRefresh": true
  }'
```

**Expected:**
- ✅ Fetches fresh cost from Google Ads API
- ✅ Shows campaigns with current spend
- ✅ Cost matches Google Ads dashboard

### Test 2: Today's Revenue Data

**Expected:**
- ✅ Fetches fresh revenue from Predicto API
- ✅ Revenue filtered by account's channels
- ✅ Revenue matches Predicto dashboard for account's channels

### Test 3: Multi-Account Realtime

```bash
curl -X POST http://localhost:3000/api/predicto-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-03-08",
    "endDate": "2024-03-08",
    "accountIds": ["2382992113", "1640518611"],
    "forceRefresh": true
  }'
```

**Expected:**
- ✅ Fetches cost from both accounts
- ✅ Fetches pure revenue (all accounts)
- ✅ Summary shows combined totals
- ✅ No channel duplication

## Logging for Verification

### Check Data Freshness

When data is served, logs show:

**From Cache (15 min old):**
```
[PREDICTO_COST_REVENUE] Serving cached aggregated data (900s old)
[PREDICTO_COST_REVENUE] _dataFreshness: { source: 'redis', ageMinutes: 15, isFresh: true }
```

**Fresh from API:**
```
[PREDICTO_COST_REVENUE] No aggregated cache, fetching from API...
[PREDICTO] Google Ads data fetched in 2.3s
[PREDICTO_PURE] Single account mode: Filtering by 5 channels from channel-based data
[PREDICTO_COST_REVENUE] _dataFreshness: { source: 'api', ageMinutes: 0, isFresh: true }
```

### Response Metadata

Check `_dataFreshness` in API response:

```json
{
  "_source": "fresh-api",
  "_dataFreshness": {
    "source": "api",
    "ageMinutes": 0,
    "isFresh": true,
    "message": "Fresh data - single account view - revenue filtered by 5 channels"
  }
}
```

## Common Scenarios

### Scenario 1: View today's data at 9 AM

**First request (9:00 AM):**
- ✅ Cache miss → Fetches fresh data
- ✅ Returns realtime cost + revenue
- ✅ Caches for 15 minutes

**Second request (9:10 AM):**
- ✅ Cache hit (10 min old)
- ✅ Serves cached data (still fresh)
- ✅ Data is up to 10 minutes old (acceptable)

**Third request (9:20 AM):**
- ✅ Cache expired (20 min > 15 min TTL)
- ✅ Fetches fresh data again
- ✅ Returns updated cost + revenue

### Scenario 2: Campaign cost changes mid-day

**Before change (10:00 AM):**
- Cost: $100, Revenue: $150

**Campaign updated in Google Ads (10:15 AM):**
- New cost: $120

**Request with forceRefresh (10:16 AM):**
```json
{ "forceRefresh": true }
```
- ✅ Bypasses cache
- ✅ Fetches fresh cost: $120
- ✅ Shows updated data immediately

**Request without forceRefresh (10:16 AM):**
- ⚠️  Might show cached $100 if cache not expired yet
- ✅ Will auto-refresh after 15 minutes (at 10:15 AM)

### Scenario 3: Viewing yesterday's data (more stable)

**Request:**
```json
{
  "startDate": "2024-03-07", // Yesterday
  "endDate": "2024-03-07"
}
```

**Cache TTL:** 2 hours (more stable data)

- ✅ Yesterday's data rarely changes
- ✅ 2-hour cache reduces API calls
- ✅ Still reasonably fresh

## Summary

### Realtime Data Accuracy Guarantees

| Data Type | Cache TTL | Freshness | Force Refresh |
|-----------|-----------|-----------|---------------|
| Today's cost | 15 min | Excellent | Available |
| Today's revenue | 15 min | Excellent | Available |
| Yesterday's data | 2 hours | Good | Available |
| Historical data | 12 hours | Acceptable | Available |

### Changes Impact on Accuracy

- ✅ **No impact on cost data** - Still fetched from Google Ads API
- ✅ **No impact on revenue data** - Still fetched from Predicto API
- ✅ **No impact on cache TTL** - Still 15 minutes for today
- ✅ **Improved single account accuracy** - No longer includes other accounts' revenue
- ✅ **Same multi-account accuracy** - Pure revenue prevents duplication

### Best Practices for Realtime Data

1. **For critical decisions:** Use `forceRefresh: true`
2. **For dashboards:** Normal caching is fine (15 min is fresh enough)
3. **After updating campaigns:** Wait 15 min or force refresh
4. **For historical analysis:** Cache is beneficial (reduces load)

## Conclusion

**✅ Realtime/daily data accuracy is PRESERVED and actually IMPROVED by these changes.**

The modifications optimize how we fetch and aggregate revenue data without affecting the underlying data quality or cache freshness. Today's data is still cached for only 15 minutes, ensuring excellent realtime accuracy.

**Key improvements:**
1. Single account views no longer fetch unnecessary all-account revenue
2. Summary calculation is more accurate (filtered by account's channels)
3. Multi-account views use pure revenue (prevents duplication)
4. All changes are optimization-only, no impact on data freshness
