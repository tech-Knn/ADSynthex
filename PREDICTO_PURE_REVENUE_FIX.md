# Predicto Pure Revenue API Fix

## Problem Identified

The pure revenue API call was fetching revenue for **ALL accounts** regardless of whether viewing individual or multi-account level:

```typescript
// OLD CODE - Always fetched ALL accounts' revenue
purePredictoRevenue = await predictoApiClient.fetchRevenueData({
  dimensions: ['date'] // Returns ALL accounts combined
});
```

**Issues:**
1. **Inefficiency**: For individual account view, fetched unnecessary data for all accounts
2. **Incorrect filtering**: Tried to filter all-account revenue by channels after fetching
3. **Potential data leakage**: If filtering failed, could show revenue from other accounts

## Solution Implemented

### Changes Made

**File**: `app/api/predicto-cost-revenue/route.ts`

#### 1. Conditional Pure Revenue Fetch (Lines 670-685)

```typescript
// NEW CODE - Only fetch pure revenue for multi-account view
if (isMultiAccount) {
  console.log(`[PREDICTO_PURE] Multi-account view: Fetching PURE Predicto revenue`);
  purePredictoRevenue = await predictoApiClient.fetchRevenueData({
    start_date: startDate,
    end_date: endDate,
    metrics: ['impressions', 'clicks', 'revenue'],
    dimensions: ['date'], // Only for multi-account - returns ALL accounts
  });
} else {
  console.log(`[PREDICTO_PURE] Single account view: Will use channel-filtered revenue`);
  purePredictoRevenue = []; // Not needed for single account
}
```

**Benefits:**
- ✅ Saves API call for individual account views
- ✅ Prevents fetching unnecessary data
- ✅ Clearer code intention

#### 2. Updated Summary Calculation (Lines 994-1036)

```typescript
if (!isMultiAccount && accountChannelIds.size > 0) {
  // SINGLE ACCOUNT: Use channel-based revenue filtered by account's channels
  predictoRevenue.forEach(record => {
    const channelId = record.custom_channel_id?.toLowerCase();
    if (channelId && accountChannelIds.has(channelId)) {
      // Aggregate by channel to deduplicate
    }
  });
} else if (isMultiAccount && purePredictoRevenue.length > 0) {
  // MULTI-ACCOUNT: Use date-only pure revenue
  purePredictoRevenue.forEach(record => {
    pureRevenue += record.revenue || 0;
  });
} else {
  // Fallback: Use aggregated campaign data
}
```

**Logic:**
- **Single account**: Filters `predictoRevenue` (channel-based) by account's channels
- **Multi-account**: Uses `purePredictoRevenue` (date-only, all accounts)
- **Fallback**: Uses aggregated campaign revenue if neither applies

#### 3. Enhanced Logging and Metadata

Added `summaryMethod` to track which calculation method was used:
- `'channel-filtered-revenue'` - Single account view
- `'pure-date-only-revenue'` - Multi-account view
- `'aggregated-campaign-revenue'` - Fallback

## Behavior After Fix

### Individual Account View

**Request:**
```json
{
  "startDate": "2024-03-01",
  "endDate": "2024-03-07",
  "customerId": "2382992113"
}
```

**What happens:**
1. ✅ Fetches channel-based revenue: `dimensions: ['custom_channel_id', 'date']`
2. ❌ **Does NOT** fetch pure revenue (saves API call)
3. ✅ Filters channel-based revenue by account's predefined channels
4. ✅ Deduplicates revenue by channel (each channel counted once)
5. ✅ Summary shows only THIS account's revenue

**Response metadata:**
```json
{
  "_summaryMethod": "channel-filtered-revenue",
  "predicto_data": {
    "pure_revenue_used": false,
    "channel_count": 5
  }
}
```

### Multi-Account View

**Request:**
```json
{
  "startDate": "2024-03-01",
  "endDate": "2024-03-07",
  "accountIds": ["2382992113", "1640518611", "8091270364"]
}
```

**What happens:**
1. ✅ Fetches channel-based revenue: `dimensions: ['custom_channel_id', 'date']`
2. ✅ Fetches pure revenue: `dimensions: ['date']` (all accounts)
3. ✅ Uses pure revenue for summary (prevents channel duplication)
4. ✅ Summary shows total revenue across all accounts (deduplicated)

**Response metadata:**
```json
{
  "_summaryMethod": "pure-date-only-revenue",
  "predicto_data": {
    "pure_revenue_used": true,
    "pure_record_count": 7
  }
}
```

### All-Account Level View (Dashboard)

**Request:**
```json
{
  "startDate": "2024-03-01",
  "endDate": "2024-03-07",
  "accountIds": [...all 30 accounts...]
}
```

**What happens:**
1. ✅ Fetches channel-based revenue for all accounts
2. ✅ Fetches pure revenue (date-only, all accounts)
3. ✅ Summary uses pure revenue to match Predicto dashboard
4. ✅ Prevents double-counting shared channels

## Testing

### Test Cases

1. **Individual Account**
   ```bash
   curl -X POST http://localhost:3000/api/predicto-cost-revenue \
     -H "Content-Type: application/json" \
     -d '{
       "startDate": "2024-03-01",
       "endDate": "2024-03-07",
       "customerId": "2382992113"
     }'
   ```
   **Expected:** `pure_revenue_used: false`, summary filtered by account channels

2. **Multiple Accounts**
   ```bash
   curl -X POST http://localhost:3000/api/predicto-cost-revenue \
     -H "Content-Type: application/json" \
     -d '{
       "startDate": "2024-03-01",
       "endDate": "2024-03-07",
       "accountIds": ["2382992113", "1640518611"]
     }'
   ```
   **Expected:** `pure_revenue_used: true`, pure revenue API called

3. **All Accounts (Dashboard)**
   ```bash
   curl -X POST http://localhost:3000/api/predicto-cost-revenue \
     -H "Content-Type: application/json" \
     -d '{
       "startDate": "2024-03-01",
       "endDate": "2024-03-07",
       "accountIds": [all 30 account IDs]
     }'
   ```
   **Expected:** `pure_revenue_used: true`, matches Predicto dashboard totals

### Log Output Examples

**Single Account:**
```
[PREDICTO_PURE] Single account view: Will use channel-filtered revenue
[PREDICTO_PURE] Single account mode: Filtering by 5 channels from channel-based data
[PREDICTO_PURE] Single account filtered: 5 unique channels, Revenue=$1,234.56
[PREDICTO_PURE] ✅ Summary calculated with channel-filtered-revenue: $1,234.56
```

**Multi-Account:**
```
[PREDICTO_PURE] Multi-account view: Fetching PURE Predicto revenue (date-only, all accounts)
[PREDICTO_PURE] Retrieved 7 daily records from Predicto (all accounts)
[PREDICTO_PURE] Multi-account mode: Using date-only pure revenue from all accounts
[PREDICTO_PURE] ✅ Summary calculated with pure-date-only-revenue: $45,678.90
```

## Performance Improvements

### Before Fix
- **Single account view**: 2 Predicto API calls (channel-based + pure)
- **Multi-account view**: 2 Predicto API calls (channel-based + pure)

### After Fix
- **Single account view**: 1 Predicto API call (channel-based only) ✅ 50% reduction
- **Multi-account view**: 2 Predicto API calls (channel-based + pure) - unchanged

**Estimated impact:**
- 50% reduction in Predicto API calls for individual account views
- Faster response time for single account queries
- Reduced load on Predicto API

## Verification Checklist

- [x] Pure revenue only fetched for multi-account view
- [x] Single account uses channel-filtered revenue
- [x] Summary calculation logic updated
- [x] Enhanced logging for debugging
- [x] Metadata includes summary method
- [x] Validation logic updated
- [ ] Test with single account view
- [ ] Test with multi-account view
- [ ] Verify revenue totals match Predicto dashboard
- [ ] Check logs for correct method selection

## Related Files

- `app/api/predicto-cost-revenue/route.ts` - Main changes
- `lib/predicto-api.ts` - Predicto API client
- `lib/predicto-cost-revenue.ts` - Revenue calculation utilities

## Rollback

If issues occur, revert changes to:
```
app/api/predicto-cost-revenue/route.ts
```

Original behavior:
- Always fetched pure revenue regardless of view type
- Filtered after fetching (less efficient)

## Next Steps

1. Test in development environment
2. Monitor logs for correct method selection
3. Verify revenue totals match expected values
4. Deploy to production after validation
