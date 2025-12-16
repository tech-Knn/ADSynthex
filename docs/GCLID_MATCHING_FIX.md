# GCLID-Based Cost/Revenue Matching Implementation

## Problem Summary
The previous implementation was attempting to match Google Ads cost data with Compado revenue data using **keywords**, which caused data mismatches when multiple campaigns shared the same keywords. This resulted in incorrect cost/revenue attribution.

## Solution Overview
We've implemented **GCLID-based matching** to ensure accurate 1:1 mapping between Google Ads clicks and Compado conversions using unique click identifiers.

## ⚠️ Critical Google API Limitation
**The `click_view` resource can ONLY query ONE day at a time.** If you try to query multiple days, you'll get this error:
```
"Queries including ClickView must have a filter limiting the results to one day."
```

**Our Solution**: The code automatically loops through each day in your date range and fetches clicks day-by-day with a 200ms delay between requests.

---

## What is GCLID?
**GCLID (Google Click Identifier)** is a unique parameter that Google Ads appends to your landing page URLs. It allows you to track individual clicks from Google Ads through to conversions on third-party platforms like Compado.

### How it works:
1. User clicks on your Google Ad
2. Google Ads generates a unique GCLID (e.g., `Cj0KCQiA1...`)
3. User lands on your page with URL: `yoursite.com?gclid=Cj0KCQiA1...`
4. You redirect to Compado with: `compado.com?srcclkid=Cj0KCQiA1...`
5. When Compado reports conversions, they include the `srcclkid` (which is the GCLID)
6. We match Google Ads clicks (by GCLID) with Compado conversions (by srcclkid)

---

## Implementation Changes

### 1. Google Ads API - Added GCLID Fetching
**File: `lib/google-ads-config.js`**
- Added new `clickViewQuery` to fetch click-level data with GCLIDs
- Uses Google Ads API's `click_view` resource
- **IMPORTANT**: Google requires `click_view` queries to fetch ONE day at a time

```javascript
clickViewQuery: `
  SELECT
    click_view.gclid,
    campaign.id,
    campaign.name,
    ad_group.id,
    ad_group.name,
    segments.date
  FROM click_view
  WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'
  AND click_view.gclid != ''
  ORDER BY segments.date DESC`
```

**Note**: Cannot access `ad_group_ad` fields from `click_view` resource

**File: `lib/google-ads-api.ts`**
- Added `GoogleAdsClick` interface to represent click-level data
- Added `processClickData()` function to extract GCLIDs from API response
- Updated `fetchGoogleAdsData()` to fetch and return click data
- **Implements day-by-day fetching** (Google API requirement for `click_view`)
  - Loops through each day in the date range
  - Queries one day at a time with 200ms delay between days
  - Aggregates all clicks together
- Now returns: `{ campaigns, ads, clicks }`

**Important Google API Limitation**: The `click_view` resource can ONLY be queried for one day at a time. Multi-day queries will fail with:
```
"Queries including ClickView must have a filter limiting the results to one day."
```

### 2. Cost-Revenue Route - Updated to Use GCLIDs
**File: `app/api/compado-cost-revenue/route.ts`**

**Before:**
```typescript
// Generated fake GCLIDs from ad IDs
const googleAdsClicks = ads.map(ad => ({
  gclid: `generated_${ad.ad_id}`,  // ❌ Fake GCLID
  cost: ad.cost,
  ...
}));
```

**After:**
```typescript
// Uses actual GCLIDs from click_view with 3-tier cost matching
const googleAdsClicks = clicks.map(click => {
  // Try ad_group level first, then campaign level
  let metrics = adGroupMetricsMap.get(click.ad_group_id);
  let costPerClick = metrics?.cpc || 0;

  if (!metrics || metrics.cpc === 0) {
    const campaignMetrics = campaignMetricsMap.get(click.campaign_id);
    costPerClick = campaignMetrics?.cpc || 0;
  }

  return {
    gclid: click.gclid,  // ✅ Real GCLID from click_view
    cost: costPerClick,   // ✅ Cost from ad_group or campaign
    campaign_id: click.campaign_id,
    ad_group_id: click.ad_group_id,
    ...
  };
});
```

**3-Tier Cost Matching Strategy:**
1. **Ad Group Level** (Priority 1): Matches clicks to ad_group_id, uses aggregated ad group CPC
2. **Campaign Level** (Priority 2): Falls back to campaign-level CPC if ad group not found
3. **Zero Cost** (Priority 3): Shows $0 if no matching metrics found

### 3. Compado API - Already Correct
**File: `lib/compado-api.ts`**

The Compado API was already correctly configured:
- Uses `click_id` from Compado API response as the GCLID
- The `click_id` contains the actual GCLID passed via `srcclkid` parameter
- Mapping function (`mapCompadoCostRevenue`) already matches by GCLID

---

## Data Flow

```
Google Ads Click
  ↓
[click_view] → GCLID: "Cj0KCQiA1..."
  ↓
User lands on your site
  ↓
Redirect to Compado with srcclkid=Cj0KCQiA1...
  ↓
Compado Conversion API returns:
  click_id: "Cj0KCQiA1..."
  revenue: 5.50
  ↓
Our Matching Logic:
  Google GCLID "Cj0KCQiA1..." = Compado click_id "Cj0KCQiA1..."
  ↓
✅ Matched: Cost $0.25 → Revenue $5.50 = Profit $5.25
```

---

## Tracking Parameters (from Compado Docs)

Based on the Compado documentation provided:

| Parameter | Purpose | Example URL | Notes |
|-----------|---------|-------------|-------|
| `srcclkid` | Traffic source click ID (GCLID) | `?srcclkid={gclid}` | **Primary matching ID** |
| `adid` | Ad ID for GDN | `&adid={creative}` | For creative tracking |
| `cmpgid` | Campaign ID | `&cmpgid={campaign_id}` | For campaign reporting |
| `srcsid` | Sub ID tracking | `&srcsid={sub_id}` | For additional tracking |
| `adx_publisher_id` | Publisher separation | `?adx_publisher_id=example` | For publisher tracking |

**Key Point:** The `srcclkid` parameter should contain the GCLID from Google Ads for proper matching.

---

## Matching Logic

**File: `lib/compado-api.ts` (lines 308-452)**

The mapping function now works correctly:

1. **Build GCLID Map:**
   ```typescript
   // Group Compado conversions by GCLID
   const conversionMap = new Map<string, CompadoConversion[]>();
   compadoConversions.forEach(conv => {
     const gclid = conv.gclid.toLowerCase().trim();
     conversionMap.set(gclid, [...conversions]);
   });
   ```

2. **Match by GCLID:**
   ```typescript
   // For each Google Ads click with GCLID
   googleAdsClicks.forEach(click => {
     const gclid = click.gclid.toLowerCase().trim();
     const conversions = conversionMap.get(gclid) || [];

     // Calculate profit/ROI
     const revenue = conversions.reduce((sum, c) => sum + c.revenue, 0);
     const profit = revenue - click.cost;

     mappings.push({ gclid, cost, revenue, profit, roi, ... });
   });
   ```

3. **Handle Unmatched:**
   - Google Ads clicks without conversions: Show cost with $0 revenue
   - Compado conversions without matching clicks: Show revenue with $0 cost

---

## Testing the Fix

### 1. Check GCLID Fetching
```bash
# Test the API endpoint
curl -X POST http://localhost:3000/api/compado-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-01-13",
    "endDate": "2025-01-13"
  }'
```

Look for in the logs:
```
[GOOGLE_ADS_API] Fetched X clicks with GCLIDs for account ...
[COMPADO_COST_REVENUE] Extracted X actual GCLID clicks from Google Ads click_view
[COMPADO_MAPPING] Matched GCLID abc123: $0.50 cost → 2 conversions → $8.25 revenue
```

### 2. Verify Matching
Check the response:
```json
{
  "google_ads_data": {
    "clicks": [
      { "gclid": "Cj0KCQiA...", "cost": 0.25, "campaign_name": "..." }
    ]
  },
  "compado_data": {
    "conversions": [
      { "gclid": "Cj0KCQiA...", "revenue": 5.50 }
    ]
  },
  "cost_revenue_mapping": [
    {
      "gclid": "Cj0KCQiA...",
      "cost": 0.25,
      "revenue": 5.50,
      "profit": 5.25,
      "roi": 2100.00
    }
  ]
}
```

### 3. Validate Tracking URLs
Ensure your Google Ads final URLs include GCLID:
```
https://yoursite.com/landing?gclid={gclid}
```

And your redirect to Compado includes:
```
https://compado.com/click?srcclkid={gclid}&cmpgid={campaign_id}&adid={ad_id}
```

---

## Important Notes

1. **GCLID Expiration:** GCLIDs are typically valid for 90 days in Google Analytics but should be matched immediately for cost/revenue tracking

2. **Case Sensitivity:** The matching is case-insensitive and trims whitespace to handle any formatting differences

3. **Multiple Conversions:** One click (GCLID) can have multiple conversions - the total revenue is summed

4. **Cost Attribution:** Each click gets assigned the average CPC of its ad for accurate cost tracking

5. **Data Freshness:** The implementation uses Redis caching, so data might be slightly stale but will be consistent

---

## Benefits of This Approach

✅ **Accurate Attribution:** Each conversion is matched to the exact click that generated it

✅ **No Keyword Confusion:** Multiple campaigns can use same keywords without data mixing

✅ **Unique Identifiers:** GCLIDs are globally unique, preventing any collisions

✅ **Industry Standard:** GCLID tracking is the standard method for cross-platform attribution

✅ **Detailed Insights:** Can track individual click profitability and ROI

---

## Troubleshooting

### Issue: No clicks with GCLIDs showing up
**Solution:**
- Check that Google Ads API has click_view access
- Verify date range has actual clicks
- Ensure GCLID auto-tagging is enabled in Google Ads

### Issue: GCLIDs not matching between systems
**Solution:**
- Verify your tracking URL includes `{gclid}` placeholder
- Check that Compado receives `srcclkid` parameter
- Ensure no URL encoding issues (GCLIDs contain special chars)

### Issue: Cost showing as $0
**Solution:**
- Check that ad-level metrics are being fetched
- Verify the ad_id mapping between clicks and ads
- Review CPC calculation logic

---

## Next Steps

1. **Monitor for 24-48 hours** to ensure GCLIDs are being captured
2. **Verify tracking URLs** in all Google Ads campaigns
3. **Check Compado reports** to confirm srcclkid is being received
4. **Review matched data** to ensure accuracy
5. **Set up alerts** for low match rates (below 80%)

---

## Related Files

- `lib/google-ads-config.js` - Query configurations
- `lib/google-ads-api.ts` - Google Ads data fetching
- `lib/compado-api.ts` - Compado integration and matching logic
- `app/api/compado-cost-revenue/route.ts` - API endpoint handler
- `components/Compado/CompadoCostRevenueMapping.tsx` - Frontend display (if exists)

---

**Date:** January 14, 2025
**Status:** ✅ Implemented and Ready for Testing
