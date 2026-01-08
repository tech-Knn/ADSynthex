# AFS Account Verification

## AFS Accounts Requested by User

| Account | Customer ID | Status |
|---------|-------------|--------|
| **AFS-IST-05** | 3961840839 | ✅ Configured in `account-access-control.ts:32` |
| **AFS-IST-07** | 8077371478 | ✅ Configured in `account-access-control.ts:34` |
| **AFS-IST-08** | 5932592680 | ✅ Configured in `account-access-control.ts:35` |
| **AFS-IST-12** | 5351234641 | ✅ Configured in `account-access-control.ts:40` |
| **AFS-IST-13** | 7918808672 | ✅ Configured in `account-access-control.ts:41` |

## All AFS Accounts (21 total)

```typescript
// From lib/account-access-control.ts:28-48
'CID_7072817229': ['adsense'],  // AFS-IST-01
'CID_1353234754': ['adsense'],  // AFS-IST-02
'CID_6610446272': ['adsense'],  // AFS-IST-03
'CID_5700221831': ['adsense'],  // AFS-IST-04
'CID_3961840839': ['adsense'],  // AFS-IST-05 ✅
'CID_1769246493': ['adsense'],  // AFS-IST-06
'CID_8077371478': ['adsense'],  // AFS-IST-07 ✅
'CID_5932592680': ['adsense'],  // AFS-IST-08 ✅
'CID_9657188741': ['adsense'],  // AFS-08-GMT-7
'CID_5898780123': ['adsense'],  // AFS-IST-09
'CID_3851198549': ['adsense'],  // AFS-IST-10
'CID_9841818774': ['adsense'],  // AFS-IST-11
'CID_5351234641': ['adsense'],  // AFS-IST-12 ✅
'CID_7918808672': ['adsense'],  // AFS-IST-13 ✅
'CID_3090502595': ['adsense'],  // AFS-IST-14
'CID_9227278944': ['adsense'],  // AFS-IST-15
'CID_7833025125': ['adsense'],  // AFS-IST-16
'CID_1622548445': ['adsense'],  // AFS-IST-17
'CID_9622143895': ['adsense'],  // AFS-IST-18
'CID_7949737807': ['adsense'],  // AFS-IST-19
'CID_9249163427': ['adsense'],  // TRT-AFS 01
```

## Issues Fixed

### 1. ✅ Campaign Names Showing Style IDs
**Problem:** Campaign names like "16/09-UV Curing Equipment-Ch64Xstyle1"
**Fix:** Added `cleanCampaignName()` function to remove style ID patterns
- Removes patterns: `Ch64Xstyle1`, `style123`, etc.
- Location: `app/api/adsense-cost-revenue/route.ts:198-214`

**Example:**
```
Before: "16/09-UV Curing Equipment-Ch64Xstyle1"
After:  "16/09-UV Curing Equipment"
```

### 2. ✅ Today's Data Not Loading Fast/Correctly
**Fix:** Smart caching based on date
- **Today's data:** Higher priority (9), no stale cache, 15s timeout
- **Historical data:** Normal priority (8), allow stale cache, 15s timeout
- Location: `app/api/adsense-cost-revenue/route.ts:82-124`

**Logic:**
```typescript
const today = new Date().toISOString().split('T')[0];
const isToday = startDate === today || endDate === today;

// For today: Fresh data
priority: isToday ? 9 : 8
allowStale: !isToday  // false for today, true for historical
```

### 3. ✅ Redis Cache TTL Optimizations
**Changes:**
- Current day: 1h → **2 hours**
- Recent (7 days): 2h → **6 hours**
- Historical: 4h → **24 hours**
- Memory cache: 20 → **100 entries**
- Location: `lib/redis-cache-manager.ts:43-67`

## Testing Checklist

### Individual Account Testing
Test each AFS account individually:

```bash
# AFS-IST-05
curl -X POST http://localhost:3000/api/adsense-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-01-18",
    "endDate": "2025-01-18",
    "adsenseAccountId": "pub-XXXXXX",
    "customerId": "3961840839"
  }'

# AFS-IST-07
# customerId: "8077371478"

# AFS-IST-08
# customerId: "5932592680"

# AFS-IST-12
# customerId: "5351234641"

# AFS-IST-13
# customerId: "7918808672"
```

### Date Range Testing

1. **Today Only:**
   ```json
   {
     "startDate": "2025-01-18",
     "endDate": "2025-01-18"
   }
   ```
   Expected: Fresh data, < 3 seconds

2. **Last 7 Days:**
   ```json
   {
     "startDate": "2025-01-11",
     "endDate": "2025-01-18"
   }
   ```
   Expected: Mostly cached, < 5 seconds

3. **Historical (30 days ago):**
   ```json
   {
     "startDate": "2024-12-19",
     "endDate": "2024-12-19"
   }
   ```
   Expected: Fully cached, < 1 second

## Expected Performance

| Date Range | First Load | Second Load | Campaign Names |
|------------|-----------|-------------|----------------|
| Today | 3-5s | 1-2s | ✅ Clean (no style IDs) |
| Last 7 days | 5-8s | 1-3s | ✅ Clean |
| Historical | 5-8s | 0.5-1s | ✅ Clean |

## Monitoring

Check logs for:
```
[ADSENSE_REVENUE] Date analysis: isToday=true, isOnlyToday=true
[ADSENSE_COST_REVENUE] Fetching single account: 3961840839
```

Verify campaign names don't contain:
- ❌ `Ch64Xstyle1`
- ❌ `style123`
- ❌ `-style1`
- ✅ Should be clean: "UV Curing Equipment"
