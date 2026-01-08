# Channel ID-Based Cost & Revenue Mapping

## Overview

The system now uses **channel ID-based mapping** to correctly match Google Ads cost with Predicto revenue. This ensures accurate profit, ROI, and ROAS calculations.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CHANNEL ID MAPPING                        │
└─────────────────────────────────────────────────────────────┘

Google Ads Campaigns                    Predicto Revenue
├─ Campaign A                           ├─ Channel ch88087
│  ├─ Cost: $100                        │  └─ Revenue: $200
│  ├─ Final URL:                        │
│  │  ?cid=ch88087                      ├─ Channel ch88088
│  └─ Extracted: [ch88087] ─────────────┤  └─ Revenue: $150
│                                       │
├─ Campaign B                           └─ Channel ch88089
│  ├─ Cost: $75                            └─ Revenue: $100
│  ├─ Final URL:
│  │  ?cid=ch88088
│  └─ Extracted: [ch88088] ─────────────┘

                    ↓

Combined Mapping (by Channel ID)
├─ Campaign A → ch88087
│  ├─ Cost: $100
│  ├─ Revenue: $200
│  ├─ Profit: $100
│  └─ ROI: 100%
│
├─ Campaign B → ch88088
│  ├─ Cost: $75
│  ├─ Revenue: $150
│  ├─ Profit: $75
│  └─ ROI: 100%
│
└─ Channel ch88089 (orphaned)
   ├─ Cost: $0
   ├─ Revenue: $100
   ├─ Profit: $100
   └─ ROI: N/A
```

## Implementation Details

### Step 1: Extract Channel IDs from Google Ads

**File**: `lib/predicto-channel-mapper.ts`

```typescript
// Extracts channel IDs from Final URLs
extractChannelIdsFromUrl("https://site.com?cid=ch88087")
// Returns: ["ch88087"]

extractChannelIdsFromUrl("https://site.com?cid=ch88087+ch88088")
// Returns: ["ch88087", "ch88088"]
```

**Supported URL formats:**
- `?cid=ch88087` (single channel)
- `?cid=ch88087+ch88088` (multiple channels with +)
- `?cid=ch88087,ch88088` (multiple channels with comma)
- `?search=test&cid=ch88087` (channel ID with other params)

### Step 2: Build Channel-to-Revenue Map

**File**: `lib/predicto-cost-revenue.ts` (lines 253-274)

```typescript
// Predicto data grouped by custom_channel_id
channelRevenueMap = {
  "ch88087": { revenue: 200, clicks: 50, impressions: 1000 },
  "ch88088": { revenue: 150, clicks: 40, impressions: 800 },
  "ch88089": { revenue: 100, clicks: 25, impressions: 500 }
}
```

### Step 3: Build Campaign-to-Channel Map

**File**: `lib/predicto-cost-revenue.ts` (lines 276-321)

```typescript
// Google Ads campaigns mapped to channels
campaignToChannelsMap = {
  "12345": {
    campaign_id: "12345",
    campaign_name: "Campaign A",
    channel_ids: ["ch88087"],
    cost: 100,
    clicks: 50,
    impressions: 1000
  },
  "67890": {
    campaign_id: "67890",
    campaign_name: "Campaign B",
    channel_ids: ["ch88088"],
    cost: 75,
    clicks: 40,
    impressions: 800
  }
}
```

### Step 4: Combine Cost and Revenue

**File**: `lib/predicto-cost-revenue.ts` (lines 323-370)

For each campaign:
1. Sum revenue from all associated channels
2. Calculate profit = revenue - cost
3. Calculate ROI = ((revenue - cost) / cost) × 100
4. Calculate ROAS = revenue / cost
5. Mark as `has_cost_data: true` and `has_revenue_data: true`

For orphaned channels (revenue without cost):
1. Add as separate entry
2. Show revenue and profit
3. Mark as `has_cost_data: false` and `has_revenue_data: true`

## API Usage

### Endpoint: `/api/predicto-cost-revenue`

**Request:**
```json
POST /api/predicto-cost-revenue
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-07",
  "customerId": "2382992113"
}
```

**Response:**
```json
{
  "campaign_aggregated": [
    {
      "campaign_id": "12345",
      "campaign_name": "Campaign A",
      "channel_ids": ["ch88087"],
      "cost": 100.00,
      "revenue": 200.00,
      "profit": 100.00,
      "roi": 100.00,
      "roas": 2.00,
      "has_cost_data": true,
      "has_revenue_data": true
    },
    {
      "campaign_id": "ch88089",
      "campaign_name": "Channel ch88089",
      "channel_ids": ["ch88089"],
      "cost": 0,
      "revenue": 100.00,
      "profit": 100.00,
      "roi": 0,
      "roas": 0,
      "has_cost_data": false,
      "has_revenue_data": true
    }
  ],
  "summary": {
    "total_campaigns": 2,
    "campaigns_matched": 1,
    "campaigns_with_cost": 1,
    "campaigns_with_revenue": 2,
    "total_cost": 100.00,
    "total_revenue": 300.00,
    "total_profit": 200.00,
    "average_roi": 200.00,
    "match_rate": 50.00
  }
}
```

## Required Google Ads Setup

### 1. Add Final URLs to Ads

**CRITICAL**: Final URLs must be added to **ads**, not campaigns!

Go to: **Google Ads → Campaigns → Ads & extensions → Ads**

For each ad, set the Final URL:
```
https://your-site.com/page?cid=ch88087
```

### 2. Channel ID Format

- **Format**: `chXXXXX` (e.g., `ch88087`)
- **Must match**: Predicto's `custom_channel_id` exactly
- **Case-sensitive**: `ch88087` ≠ `CH88087`

### 3. Multiple Channels

Use `+` or `,` to separate multiple channel IDs:
```
?cid=ch88087+ch88088
?cid=ch88087,ch88088
```

## Verification Steps

### Step 1: Check Server Logs

When calling `/api/predicto-cost-revenue`, look for:

```
[PREDICTO_COST_REVENUE] 📊 Campaigns with Final URLs: 8/8
[PREDICTO_COST_REVENUE] 📎 Sample Final URL: https://site.com?cid=ch88087
[PREDICTO_COST_REVENUE] 🔖 Extracted 16 unique channel IDs from campaigns: ch88087, ch88088, ...
[PREDICTO_COST_REVENUE] 🔖 Predicto has 20 unique channel IDs: ch88087, ch88088, ...
[PREDICTO_CHANNEL_MAPPING] Built revenue map with 20 unique channels
[PREDICTO_CHANNEL_MAPPING] Extracted channels: 8 campaigns with channels, 0 without
[PREDICTO_CHANNEL_MAPPING] Mapped 28 total items: 12 with both, 4 cost-only, 12 revenue-only
```

### Step 2: Check API Response

Look for campaigns with `has_cost_data: true` AND `has_revenue_data: true`:

```json
{
  "campaign_id": "12345",
  "has_cost_data": true,
  "has_revenue_data": true,
  "cost": 100.00,
  "revenue": 200.00,
  "profit": 100.00
}
```

### Step 3: Verify Summary

Check that:
- `campaigns_matched` > 0
- `total_cost` > 0
- `total_revenue` > 0
- `match_rate` > 0

## Troubleshooting

### Issue 1: No Campaigns Have Final URLs

**Log:**
```
📊 Campaigns with Final URLs: 0/8
⚠️  WARNING: No campaigns have Final URLs!
```

**Cause**: Ads don't have Final URLs configured.

**Solution**: Add Final URLs to your Google Ads ads (not campaigns).

---

### Issue 2: No Channel IDs Extracted

**Log:**
```
📎 Sample Final URL: https://site.com/page
🔖 Extracted 0 unique channel IDs
```

**Cause**: Final URLs are missing the `cid` parameter.

**Solution**: Update Final URLs to include `?cid=chXXXXX`:
```
Before: https://site.com/page
After:  https://site.com/page?cid=ch88087
```

---

### Issue 3: Channel IDs Don't Match

**Log:**
```
🔖 Extracted channel IDs: ch88087, ch88088
🔖 Predicto has channel IDs: ch88099, ch88100
📊 Matching: 0 with both, 8 cost-only, 8 revenue-only
```

**Cause**: Google Ads and Predicto use different channel IDs.

**Solution**: Ensure channel IDs match exactly:
1. Check Google Ads Final URLs: `?cid=ch88087`
2. Check Predicto dashboard: `custom_channel_id: "ch88087"`
3. Update one or both to match

---

### Issue 4: Some Campaigns Match, Others Don't

**Log:**
```
📊 Matching: 4 with both, 4 cost-only, 8 revenue-only
```

**This is normal!** It means:
- **4 campaigns**: Have both cost and revenue ✅
- **4 campaigns**: Have cost but no revenue (not generating revenue yet)
- **8 channels**: Have revenue but no cost (orphaned channels)

**To improve**:
1. Add Final URLs with `cid` to all campaigns
2. Verify channel IDs are correct
3. Check if campaigns are active and generating traffic

## New Functions

### `mapCostRevenueByChannelId()`

**File**: `lib/predicto-cost-revenue.ts:234-414`

Maps Google Ads campaigns to Predicto revenue using channel IDs.

**Input:**
- Google Ads campaigns with `final_urls`
- Predicto revenue with `custom_channel_id`

**Output:**
- Mapped campaigns with cost, revenue, profit, ROI
- Orphaned channels (revenue without cost)

**Usage:**
```typescript
import { mapCostRevenueByChannelId } from '@/lib/predicto-cost-revenue';

const mappings = mapCostRevenueByChannelId(googleAdsCampaigns, predictoRevenue);
```

### `fetchCostRevenueByChannelId()`

**File**: `lib/predicto-cost-revenue.ts:463-498`

Fetches Predicto revenue and maps it to Google Ads cost using channel IDs.

**Usage:**
```typescript
import { fetchCostRevenueByChannelId } from '@/lib/predicto-cost-revenue';

const { mappings, aggregated, summary } = await fetchCostRevenueByChannelId(
  '2026-01-01',
  '2026-01-07',
  googleAdsCampaigns
);
```

## Benefits of Channel ID Mapping

### ✅ Accurate Attribution
- Cost and revenue are matched by the actual traffic source (channel)
- No reliance on campaign ID synchronization

### ✅ Multi-Channel Support
- One campaign can map to multiple channels
- Handles complex traffic routing

### ✅ Orphaned Channel Detection
- Identifies channels with revenue but no cost
- Helps find unmapped traffic sources

### ✅ Flexible URL Structure
- Works with any URL as long as `cid` parameter is present
- Supports multiple formats (+ or comma separated)

## Migration from Campaign ID Mapping

### Old Approach (Campaign ID)
```typescript
// ❌ Required campaign IDs to match exactly
{
  google_ads_campaign_id: "12345",
  predicto_campaign_id: "12345",
  // Match only if IDs are identical
}
```

### New Approach (Channel ID)
```typescript
// ✅ Matches by traffic source (channel)
{
  campaign_final_url: "?cid=ch88087",
  predicto_custom_channel_id: "ch88087",
  // Match based on actual traffic routing
}
```

## Diagnostic Tools

### `/api/predicto-diagnostic`

Comprehensive diagnostic endpoint to identify mapping issues.

**Usage:**
```bash
POST /api/predicto-diagnostic
{
  "startDate": "2026-01-01",
  "endDate": "2026-01-07",
  "customerId": "2382992113"
}
```

**Returns:**
- Campaign analysis (cost, URLs, channel IDs)
- Predicto analysis (channel IDs, revenue)
- Mapping analysis (matches, mismatches)
- Specific issues and recommendations

### Test Script

**File**: `scripts/test-predicto-mapping.ts`

**Usage:**
```bash
npx tsx scripts/test-predicto-mapping.ts
```

Displays:
- Summary statistics
- Issues found
- Recommendations
- Sample campaigns
- Channel ID comparison

## Key Takeaways

1. **Channel ID is the bridge**: Google Ads Final URLs must have `?cid=chXXXXX`
2. **Final URLs are critical**: Without them, no mapping is possible
3. **Channel IDs must match**: Google Ads and Predicto must use identical IDs
4. **Use diagnostics**: Run `/api/predicto-diagnostic` to identify issues
5. **Monitor logs**: Check server logs for detailed mapping information

---

**Status**: ✅ Implemented and ready for use
**Date**: 2026-01-07
**Version**: 2.0.0
