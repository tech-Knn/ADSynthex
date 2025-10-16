# Campaign-Level Aggregation Implementation

## ✅ Summary
Successfully added **campaign-level aggregation** to the GCLID-based cost/revenue matching system. You now get both **click-level detail** AND **campaign-level summary** in one API response.

---

## What Was Changed

### 1. **Added Campaign Aggregation Function** (`lib/compado-api.ts`)

New function: `aggregateMappingsByCampaign()`

**What it does:**
- Takes click-level mappings (one row per GCLID)
- Groups them by `campaign_id`
- Sums up all metrics (cost, clicks, conversions, revenue)
- Calculates campaign-level KPIs (CPC, CTR, ROI, ROAS, etc.)
- Returns one row per campaign

**Example Input** (Click-Level):
```
GCLID: CjwKCAjw..., Campaign: VPN Streaming, Cost: $0.05, Revenue: $0.02
GCLID: EAIaIQob..., Campaign: VPN Streaming, Cost: $0.05, Revenue: $0.02
GCLID: CjwKCAjx..., Campaign: Solar Tiles, Cost: $0.04, Revenue: $0.00
```

**Example Output** (Campaign-Level):
```
Campaign: VPN Streaming
  • 2 unique GCLIDs
  • Total Cost: $0.10
  • Total Revenue: $0.04
  • Total Profit: -$0.06
  • ROI: -60%
  • ROAS: 0.4x

Campaign: Solar Tiles
  • 1 unique GCLID
  • Total Cost: $0.04
  • Total Revenue: $0.00
  • Total Profit: -$0.04
  • ROI: -100%
  • ROAS: 0.0x
```

---

### 2. **Updated API Response** (`app/api/compado-cost-revenue/route.ts`)

Added new field to response:

```typescript
{
  "cost_revenue_mapping": [...],      // Click-level data (one row per GCLID)
  "campaign_aggregated": [...],       // Campaign-level data (one row per campaign) ← NEW!
  "summary": {...}                    // Overall totals
}
```

**Log output:**
```
[COMPADO_COST_REVENUE] Campaign aggregation: X campaigns
[COMPADO_COST_REVENUE] Mapping complete: Y click-level mappings, X campaigns
```

---

### 3. **Updated Frontend** (`app/compado/page.tsx`)

**Before:**
- Displayed `cost_revenue_mapping` (click-level data)
- Showed every individual GCLID as a separate row

**After:**
- Displays `campaign_aggregated` (campaign-level data)
- Shows one row per campaign with aggregated metrics
- Alert shows: "Loaded X campaigns (Y click-level mappings)"

**User Experience:**
Instead of seeing 20 rows for 20 clicks, you see:
- 3 campaigns with aggregated data
- Clearer overview of campaign performance
- Easier to identify profitable vs unprofitable campaigns

---

## Data Structure

### Campaign Aggregated Object
```typescript
{
  gclid: "5 unique GCLIDs",           // Count of unique clicks
  campaign_id: "23098933914",
  campaign_name: "VPN for Streaming - WW",

  // Aggregated Google Ads Metrics
  cost: 0.25,                          // Total cost for campaign
  clicks: 5,                           // Total clicks
  impressions: 5,                      // Total impressions
  cpc: 0.05,                           // Average CPC
  ctr: 100.00,                         // Average CTR

  // Aggregated Compado Metrics
  conversions: 3,                      // Total conversions
  revenue: 0.06,                       // Total revenue
  conversion_rate: 60.00,              // Conversion rate %
  revenue_per_click: 0.012,            // Avg revenue per click

  // Calculated Metrics
  profit: -0.19,                       // Total profit (revenue - cost)
  roi: -76.00,                         // Return on Investment %
  roas: 0.24,                          // Return on Ad Spend

  date: "2025-01-07 to 2025-01-14"    // Date range
}
```

---

## Benefits

### ✅ **Campaign-Level View**
- See total spend and revenue per campaign
- Identify profitable vs unprofitable campaigns at a glance
- Make budget decisions based on campaign performance

### ✅ **Better Analytics**
- Aggregate ROI/ROAS per campaign
- Overall conversion rate per campaign
- Total profit/loss per campaign

### ✅ **Cleaner Dashboard**
- Instead of 100+ rows (one per click), see 5-10 campaigns
- Easier to spot trends
- Better for reporting to stakeholders

### ✅ **Both Views Available**
- `campaign_aggregated`: High-level overview
- `cost_revenue_mapping`: Detailed click-level data (for deep dives)

---

## API Response Structure

```json
{
  "google_ads_data": {
    "clicks": [...],                    // Raw GCLID clicks from Google Ads
    "total_clicks": 100,
    "total_cost": 5.50
  },
  "compado_data": {
    "conversions": [...],               // Raw conversions from Compado
    "total_conversions": 30,
    "total_revenue": 3.25
  },
  "cost_revenue_mapping": [            // Click-level (one row per GCLID)
    {
      "gclid": "CjwKCAjw...",
      "campaign_name": "VPN Streaming",
      "cost": 0.05,
      "revenue": 0.02,
      "profit": -0.03
    },
    ...
  ],
  "campaign_aggregated": [             // Campaign-level (one row per campaign) ✨ NEW
    {
      "gclid": "20 unique GCLIDs",
      "campaign_name": "VPN Streaming - WW",
      "cost": 1.00,
      "revenue": 0.40,
      "profit": -0.60,
      "roi": -60.0,
      "roas": 0.4,
      "conversions": 8,
      "clicks": 20
    },
    ...
  ],
  "summary": {                          // Overall totals
    "totalCost": 5.50,
    "totalRevenue": 3.25,
    "totalProfit": -2.25,
    "totalConversions": 30,
    "overallROI": -40.91,
    "overallROAS": 0.59
  }
}
```

---

## Frontend Display

### **Campaign Table** (Default View)
| Campaign | Cost | Clicks | Revenue | Conversions | Profit | ROI | ROAS |
|----------|------|--------|---------|-------------|--------|-----|------|
| VPN Streaming - WW | $1.00 | 20 | $0.40 | 8 | -$0.60 | -60% | 0.4x |
| Solar Roof Tiles - WW | $0.80 | 20 | $0.00 | 0 | -$0.80 | -100% | 0.0x |
| Proxy Services - WW | $0.50 | 10 | $0.85 | 5 | +$0.35 | +70% | 1.7x |

**✨ Much cleaner than showing 50 individual GCLID rows!**

---

## How to Use

### **View Campaign-Level Data** (Default)
The dashboard now shows aggregated campaigns by default:
```typescript
// In CompadoCostRevenueMapping component
<CompadoCostRevenueMapping
  data={data.campaign_aggregated}  // ← Shows campaign aggregates
  summary={data.summary}
/>
```

### **View Click-Level Data** (For Debugging)
If you need to see individual GCLID details:
```typescript
// Change to:
<CompadoCostRevenueMapping
  data={data.cost_revenue_mapping}  // ← Shows individual clicks
  summary={data.summary}
/>
```

### **Access Both in API Response**
```javascript
const response = await fetch('/api/compado-cost-revenue', {
  method: 'POST',
  body: JSON.stringify({ startDate, endDate, customerId })
});

const data = await response.json();

// Campaign-level (aggregated)
console.log('Campaigns:', data.campaign_aggregated);

// Click-level (detailed)
console.log('Clicks:', data.cost_revenue_mapping);
```

---

## Testing

Test the API:
```bash
curl -X POST http://localhost:3000/api/compado-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-01-07",
    "endDate": "2025-01-14",
    "customerId": "5416418019"
  }'
```

**Expected Logs:**
```
[COMPADO_COST_REVENUE] Aggregating by campaign...
[COMPADO_COST_REVENUE] Campaign aggregation: 3 campaigns
[COMPADO_COST_REVENUE] Mapping complete: 45 click-level mappings, 3 campaigns
```

**Dashboard Should Show:**
- Alert: "Loaded 3 campaigns (45 click-level mappings)"
- Table with 3 campaign rows (not 45 click rows)
- Each campaign shows totals and averages

---

## Summary of Changes

| File | What Changed |
|------|-------------|
| `lib/compado-api.ts` | ✅ Added `aggregateMappingsByCampaign()` function |
| `app/api/compado-cost-revenue/route.ts` | ✅ Added `campaign_aggregated` to response |
| `app/compado/page.tsx` | ✅ Updated to display `campaign_aggregated` instead of `cost_revenue_mapping` |
| `CompadoCostRevenueMapping.tsx` | ✅ No changes needed (accepts same data structure) |

---

## Benefits Summary

Before:
- ❌ Seeing 50-100 rows of individual clicks
- ❌ Hard to see campaign-level performance
- ❌ Difficult to make budget decisions

After:
- ✅ See 5-10 campaign rows
- ✅ Clear campaign-level ROI/ROAS
- ✅ Easy to identify profitable campaigns
- ✅ Both views available (aggregated + detailed)

---

**Date:** January 14, 2025
**Status:** ✅ Implemented and Ready
**Backward Compatible:** Yes (both `campaign_aggregated` and `cost_revenue_mapping` available)
