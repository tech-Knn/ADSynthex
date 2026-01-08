# Predicto Cost & Revenue Mapping Fix

## Problem Identified

The system was **only fetching revenue** and **not mapping cost** because:

1. **Campaign-level data doesn't include Final URLs** - Only ad-level data has `final_urls`
2. Without Final URLs, channel IDs couldn't be extracted
3. Without channel IDs, Google Ads cost couldn't be matched to Predicto revenue

## Solution Implemented

### 1. Extract Final URLs from Ads

**File**: `app/api/predicto-cost-revenue/route.ts` (lines 316-333)

```typescript
// First, extract final_urls from ads and map them to campaigns
googleAdsData.forEach((accountData) => {
  if (accountData?.ads && Array.isArray(accountData.ads)) {
    accountData.ads.forEach((ad: any) => {
      const campaignId = ad.campaign_id || ad.id;
      if (ad.final_urls && Array.isArray(ad.final_urls)) {
        if (!campaignFinalUrlsMap.has(campaignId)) {
          campaignFinalUrlsMap.set(campaignId, new Set());
        }
        ad.final_urls.forEach((url: string) => {
          campaignFinalUrlsMap.get(campaignId)!.add(url);
        });
      }
    });
  }
});
```

### 2. Enrich Campaigns with Final URLs

**File**: `app/api/predicto-cost-revenue/route.ts` (lines 336-355)

```typescript
// Then, extract campaigns and enrich with final_urls
googleAdsData.forEach((accountData) => {
  if (accountData?.campaigns && Array.isArray(accountData.campaigns)) {
    accountData.campaigns.forEach((campaign: any) => {
      const campaignId = campaign.campaign_id || campaign.id;
      const finalUrls = campaignFinalUrlsMap.has(campaignId)
        ? Array.from(campaignFinalUrlsMap.get(campaignId)!)
        : [];

      allCampaigns.push({
        campaign_id: campaignId,
        campaign_name: campaign.campaign_name || campaign.name,
        final_urls: finalUrls, // ✅ Now populated from ads
        cost: campaign.cost || 0,
        clicks: campaign.clicks || 0,
        impressions: campaign.impressions || 0,
        conversions: campaign.conversions || 0,
      });
    });
  }
});
```

### 3. Added Enhanced Debug Logging

**File**: `app/api/predicto-cost-revenue/route.ts`

New logs will show:
- ✅ `📎 Extracted final URLs for X campaigns from ads`
- ✅ `📊 Campaigns with Final URLs: X/Y`
- ✅ `📎 Sample Final URL: https://...`
- ✅ `🔖 Extracted X unique channel IDs from campaigns: ch88087, ch88098, ...`
- ✅ `🔖 Predicto has X unique channel IDs: ch88087, ch88099, ...`
- ✅ `📊 Matching: X with both, Y cost-only, Z revenue-only`

---

## How to Verify the Fix

### Step 1: Check Server Logs

When you call the `/api/predicto-cost-revenue` endpoint, look for these logs:

```
[PREDICTO_COST_REVENUE] 📎 Extracted final URLs for 8 campaigns from ads
[PREDICTO_COST_REVENUE] Extracted 8 campaigns from Google Ads data
[PREDICTO_COST_REVENUE] 📊 Campaigns with Final URLs: 8/8
[PREDICTO_COST_REVENUE] 📎 Sample Final URL: https://site.com/page?cid=ch88087
[PREDICTO_COST_REVENUE] 🔖 Extracted 16 unique channel IDs from campaigns: ch88087, ch88088, ...
[PREDICTO_COST_REVENUE] Retrieved 150 Predicto revenue records
[PREDICTO_COST_REVENUE] 🔖 Predicto has 20 unique channel IDs: ch88087, ch88088, ...
[PREDICTO_COST_REVENUE] Combined 28 campaigns/channels before filtering
[PREDICTO_COST_REVENUE] 📊 Matching: 12 with both, 4 cost-only, 12 revenue-only
```

### Step 2: Verify Data in Response

Check the API response for:

```json
{
  "campaign_aggregated": [
    {
      "campaign_id": "12345678",
      "campaign_name": "My Campaign",
      "channel_ids": ["ch88087", "ch88098"],
      "cost": 150.50,           // ✅ Should have cost data
      "revenue": 250.00,        // ✅ Should have revenue data
      "profit": 99.50,          // ✅ Should calculate profit
      "roi": 66.11,             // ✅ Should calculate ROI
      "has_cost_data": true,    // ✅ Should be true
      "has_revenue_data": true  // ✅ Should be true
    }
  ],
  "summary": {
    "campaigns_matched": 12,    // ✅ Should show matched campaigns
    "total_cost": 1500.00,      // ✅ Should have total cost
    "total_revenue": 2000.00,   // ✅ Should have total revenue
    "average_roi": 33.33        // ✅ Should calculate ROI
  }
}
```

### Step 3: Dashboard Display

On the Predicto dashboard (`/predicto`), you should see:

- ✅ Summary cards showing **Cost**, **Revenue**, **Profit**, and **ROI**
- ✅ Campaign table with both cost and revenue columns populated
- ✅ Charts showing profitability distribution
- ✅ Status badges: "Matched" (green) for campaigns with both cost and revenue

---

## Troubleshooting

### Issue: Still seeing "No Final URLs" warning

**Log**:
```
[PREDICTO_COST_REVENUE] ⚠️  WARNING: No campaigns have Final URLs!
```

**Possible causes**:
1. Google Ads API response doesn't include `ads` array
2. Ads don't have `final_urls` field
3. Feed type not configured to fetch ad-level data

**Solution**:
- Check if `accountData.ads` exists in the response
- Verify Google Ads campaigns/ads are active and have Final URLs configured
- Check bulletproof API configuration for feed type

### Issue: Final URLs don't have `cid` parameter

**Log**:
```
[PREDICTO_COST_REVENUE] 📎 Sample Final URL: https://site.com/page
[PREDICTO_COST_REVENUE] 🔖 Extracted 0 unique channel IDs
```

**Possible causes**:
- Final URLs in Google Ads don't include the `cid` parameter
- Wrong URL format

**Solution**:
1. Update Google Ads Final URLs to include `cid` parameter:
   ```
   https://site.com/page?cid=ch88087
   ```

2. Verify the URL format matches what `extractChannelIdsFromUrl()` expects

3. Example URL with macro:
   ```
   https://tunefulsoul.com/asrsearch?cid=ch88087&campaign_id={campaignid}
   ```

### Issue: Channel IDs don't match between Google Ads and Predicto

**Log**:
```
[PREDICTO_COST_REVENUE] 🔖 Extracted channel IDs: ch88087, ch88098
[PREDICTO_COST_REVENUE] 🔖 Predicto has channel IDs: ch88099, ch88100
[PREDICTO_COST_REVENUE] 📊 Matching: 0 with both, 8 cost-only, 12 revenue-only
```

**Possible causes**:
- Google Ads campaigns using different channel IDs than Predicto
- Channel ID mismatch between platforms
- Wrong accounts selected

**Solution**:
1. Verify channel IDs match:
   - Check Google Ads Final URLs: `?cid=ch88087`
   - Check Predicto dashboard: Look for `custom_channel_id`

2. Update Google Ads Final URLs with correct channel IDs

3. Check account-channel mapping in `lib/account-access-control.ts`:
   ```typescript
   'CID_2382992113': ['ch88087', 'ch88098']
   ```

### Issue: Some campaigns match, others don't

**Log**:
```
[PREDICTO_COST_REVENUE] 📊 Matching: 4 with both, 4 cost-only, 8 revenue-only
```

**This is normal!** It means:
- **4 campaigns** have both Google Ads cost and Predicto revenue ✅
- **4 campaigns** have cost but no revenue (not yet generating revenue)
- **8 channels** have revenue but no cost (orphaned channels)

**To improve matching**:
1. Ensure all active campaigns have Final URLs with `cid`
2. Verify channel IDs are consistent across platforms
3. Check if campaigns are using the correct channels

---

## Data Flow Diagram

```
┌─────────────────────┐
│   Google Ads API    │
│   (bulletproofAPI)  │
└──────────┬──────────┘
           │
           ├─► Campaigns (cost, clicks, impressions)
           │   └─► campaign.final_urls = [] (empty at campaign level)
           │
           └─► Ads (final_urls)
               └─► ad.final_urls = ["https://site.com?cid=ch88087"]

┌─────────────────────────────────────────────────┐
│  Aggregate final_urls from Ads → Campaigns     │
│  campaign.final_urls = ["https://...?cid=..."] │
└──────────┬──────────────────────────────────────┘
           │
           ├─► Extract channel IDs from URLs
           │   └─► ["ch88087", "ch88098"]
           │
           ├─► Predicto API (fetchRevenueData)
           │   └─► dimensions: ['custom_channel_id']
           │       └─► [{custom_channel_id: "ch88087", revenue: 100}, ...]
           │
           └─► combineGoogleAdsAndPredictoData()
               └─► Match by channel_id
                   ├─► cost (from Google Ads)
                   ├─► revenue (from Predicto)
                   └─► calculate: profit, ROI, ROAS

┌─────────────────────┐
│  Filter by channel  │
│  access control     │
└──────────┬──────────┘
           │
           └─► Return filtered data to user
```

---

## Required Google Ads Campaign Configuration

For channel mapping to work, your Google Ads campaigns must have:

### 1. Active Ads with Final URLs

```
Campaign: "My Predicto Campaign"
└─► Ad Group: "Default Ad Group"
    └─► Responsive Search Ad
        └─► Final URL: https://site.com/page?cid=ch88087&campaign_id={campaignid}
```

### 2. Final URL Format

Required parameters:
- `cid` - Channel ID (e.g., `ch88087`)
- Optional: `campaign_id={campaignid}` - Google Ads macro

Example formats:
```
✅ https://site.com/page?cid=ch88087
✅ https://site.com/page?cid=ch88087+ch88098  (multiple channels)
✅ https://site.com/page?cid=ch88087&campaign_id={campaignid}
✅ https://site.com/page?search=article&cid=ch88087
```

### 3. Channel ID Convention

- Format: `chXXXXX` (e.g., `ch88087`)
- Must match Predicto's `custom_channel_id`
- Case-sensitive

---

## Testing Checklist

- [ ] Server logs show "Extracted final URLs for X campaigns from ads"
- [ ] Server logs show "Campaigns with Final URLs: X/X" (all campaigns)
- [ ] Server logs show sample Final URL with `cid` parameter
- [ ] Server logs show extracted channel IDs
- [ ] Server logs show Predicto channel IDs
- [ ] Server logs show matching stats with "with both" > 0
- [ ] API response has campaigns with both `has_cost_data: true` and `has_revenue_data: true`
- [ ] API response shows correct `cost`, `revenue`, `profit`, and `roi` values
- [ ] Dashboard displays summary cards with cost, revenue, and profit
- [ ] Dashboard table shows campaigns with both cost and revenue columns populated
- [ ] Dashboard charts render with profitability data
- [ ] Channel access control filters data correctly per user

---

## Next Steps

1. **Test the API endpoint** with a Predicto account:
   ```bash
   POST /api/predicto-cost-revenue
   {
     "startDate": "2026-01-01",
     "endDate": "2026-01-06",
     "customerId": "2382992113"
   }
   ```

2. **Check server logs** for the new debug output

3. **Verify Final URLs** in Google Ads campaigns include `cid` parameter

4. **Match channel IDs** between Google Ads and Predicto

5. **Test dashboard** at `/predicto` to see the combined data

---

## Summary

**What was fixed**:
- ✅ Extract `final_urls` from ad-level data
- ✅ Aggregate `final_urls` to parent campaigns
- ✅ Extract channel IDs from URLs
- ✅ Map Google Ads cost to Predicto revenue by channel ID
- ✅ Added comprehensive debug logging
- ✅ Fixed channel ID mapping logic

**Result**:
Cost and revenue data should now properly map together, showing campaigns with both metrics, accurate profit/ROI calculations, and working channel-level access control.

---

**Status**: Ready for testing
**Date**: 2026-01-06
**Version**: 1.1.0
