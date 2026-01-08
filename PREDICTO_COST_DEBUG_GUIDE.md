# Predicto Cost Debugging Guide

## Problem: Cost Data Not Showing

You mentioned cost is not fetching. Let's diagnose step by step using the new logging.

---

## Diagnostic Logs to Check

When you call `/api/predicto-cost-revenue`, look for these logs in order:

### 1. **Google Ads API Response** ✅
```
[PREDICTO_COST_REVENUE] 📦 Account 1: X campaigns, Y ads, total cost: $Z
```

**What to check**:
- Are campaigns being returned? (X > 0)
- Are ads being returned? (Y > 0)
- Is total cost > $0?

**If cost is $0 here**, the problem is Google Ads isn't returning cost data. Possible causes:
- Date range has no spend
- Account has no active campaigns with spend
- Feed type filter excluding all accounts
- Wrong account ID

---

### 2. **Campaign Extraction** ✅
```
[PREDICTO_COST_REVENUE] Extracted X campaigns from Google Ads data
[PREDICTO_COST_REVENUE] 💰 Cost data: Y/X campaigns have cost, total: $Z
```

**What to check**:
- Does extracted cost match the Google Ads response cost?
- How many campaigns have cost > 0?

**If cost is $0 here but wasn't in step 1**, there's a bug in extraction logic (lines 336-363).

---

### 3. **Final URLs Extraction** ✅
```
[PREDICTO_COST_REVENUE] 📎 Extracted final URLs for X campaigns from ads
[PREDICTO_COST_REVENUE] 📊 Campaigns with Final URLs: X/Y
[PREDICTO_COST_REVENUE] 📎 Sample Final URL: https://...
[PREDICTO_COST_REVENUE] 🔖 Extracted X unique channel IDs: ch88087, ...
```

**What to check**:
- Are Final URLs being extracted from ads?
- Do campaigns have Final URLs?
- Do Final URLs have `cid` parameter?
- Are channel IDs being extracted?

**If no Final URLs**, campaigns won't match with revenue. Cost will show but revenue won't.

---

### 4. **Channel Mapping** ✅
```
[CHANNEL_MAPPER] Processing X campaigns for channel mapping
[CHANNEL_MAPPER] Mapped X campaigns: Y with channels, Z without channels
[CHANNEL_MAPPER] Cost preserved: $A in → $B out
```

**What to check**:
- Is cost preserved from input to output?
- How many campaigns have channel IDs vs don't?

**If cost in ≠ cost out**, there's a bug in `mapCampaignsToChannels` function.

---

### 5. **Predicto Revenue** ✅
```
[PREDICTO_COST_REVENUE] Retrieved X Predicto revenue records
[PREDICTO_COST_REVENUE] 🔖 Predicto has X unique channel IDs: ch88087, ...
```

**What to check**:
- Is Predicto returning revenue data?
- What channel IDs does Predicto have?
- Do they match the channel IDs from Google Ads?

---

### 6. **Combined Data** ✅
```
[PREDICTO_COST_REVENUE] Combined X campaigns/channels before filtering
[PREDICTO_COST_REVENUE] 💰 Combined cost: Y/X items have cost, total: $Z
[PREDICTO_COST_REVENUE] 📊 Matching: A with both, B cost-only, C revenue-only
```

**What to check**:
- Is cost still present after combining?
- How many items have both cost and revenue?
- How many have cost only?

**This is the final check** - if cost is $0 here, the bug is in `combineGoogleAdsAndPredictoData`.

---

## Possible Issues & Solutions

### Issue 1: No Google Ads Data

**Symptoms**:
```
[PREDICTO_COST_REVENUE] 📦 Account 1: 0 campaigns, 0 ads, total cost: $0.00
```

**Causes**:
1. **Wrong account ID** - Account doesn't exist or not in Predicto feed
2. **Feed type filter** - Account not assigned to `['predicto']` feed
3. **Date range** - No data in specified date range
4. **Account inactive** - No active campaigns

**Solution**:
1. Check `lib/account-access-control.ts`:
   ```typescript
   'CID_2382992113': ['predicto'],  // Must have 'predicto' in array
   ```

2. Check account ID is correct (without CID_ prefix when calling API):
   ```json
   {
     "customerId": "2382992113"  // ✅ Correct
   }
   ```

3. Check date range has spend:
   ```json
   {
     "startDate": "2026-01-01",  // Recent date with activity
     "endDate": "2026-01-06"
   }
   ```

---

### Issue 2: No Ads Data (Final URLs missing)

**Symptoms**:
```
[PREDICTO_COST_REVENUE] 📦 Account 1: 10 campaigns, 0 ads, total cost: $150.00
[PREDICTO_COST_REVENUE] 📎 Extracted final URLs for 0 campaigns from ads
[PREDICTO_COST_REVENUE] ⚠️  WARNING: No campaigns have Final URLs!
```

**Causes**:
1. Google Ads API not returning ads
2. Campaigns have no active ads
3. Query issue in `google-ads-api.ts`

**Solution**:
1. Check if campaigns have active ads in Google Ads dashboard
2. Verify ads have Final URLs configured
3. Check `lib/google-ads-api.ts` query is fetching ad-level data

---

### Issue 3: Final URLs Without Channel IDs

**Symptoms**:
```
[PREDICTO_COST_REVENUE] 📎 Sample Final URL: https://site.com/page
[PREDICTO_COST_REVENUE] 🔖 Extracted 0 unique channel IDs
```

**Causes**:
- Final URLs don't have `cid` parameter
- Wrong URL format

**Solution**:
Update Google Ads Final URLs to include `cid`:
```
❌ https://site.com/page
✅ https://site.com/page?cid=ch88087
✅ https://site.com/page?cid=ch88087&campaign_id={campaignid}
```

---

### Issue 4: Channel IDs Don't Match

**Symptoms**:
```
[PREDICTO_COST_REVENUE] 🔖 Extracted channel IDs: ch88087, ch88098
[PREDICTO_COST_REVENUE] 🔖 Predicto has channel IDs: ch88099, ch88100
[PREDICTO_COST_REVENUE] 📊 Matching: 0 with both, 8 cost-only, 12 revenue-only
```

**Causes**:
- Google Ads campaigns using different channel IDs than Predicto
- Mismatch in channel assignment

**Solution**:
1. Verify channel IDs match between platforms
2. Update Google Ads Final URLs with correct `cid` values
3. Or update Predicto to use correct custom_channel_id

---

### Issue 5: Cost Lost in Pipeline

**Symptoms**:
```
[PREDICTO_COST_REVENUE] 💰 Cost data: 8/8 campaigns have cost, total: $150.00
[CHANNEL_MAPPER] Cost preserved: $150.00 in → $150.00 out
[PREDICTO_COST_REVENUE] 💰 Combined cost: 0/20 items have cost, total: $0.00  ❌
```

**Causes**:
- Bug in `combineGoogleAdsAndPredictoData` function
- Cost not being transferred to combined array

**Solution**:
- Check `lib/predicto-channel-mapper.ts` line 170-181
- Verify `cost` field is being set from `campaignData.cost`
- This is a bug that needs fixing

---

## Quick Diagnostic Checklist

Run the API and check these in order:

- [ ] Step 1: Google Ads returns campaigns with cost
- [ ] Step 2: Campaigns extracted with cost preserved
- [ ] Step 3: Ads extracted with Final URLs
- [ ] Step 4: Channel IDs extracted from Final URLs
- [ ] Step 5: Channel mapper preserves cost
- [ ] Step 6: Predicto returns revenue with matching channel IDs
- [ ] Step 7: Combined data has cost
- [ ] Step 8: Combined data has items with both cost and revenue

**Where it fails = where the bug is**

---

## Testing Command

```bash
curl -X POST http://localhost:3000/api/predicto-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2026-01-01",
    "endDate": "2026-01-06",
    "customerId": "2382992113"
  }'
```

Check the server console for all diagnostic logs.

---

## Expected vs Actual

### Expected Flow (All Working):
```
📦 Account 1: 8 campaigns, 50 ads, total cost: $150.00
💰 Cost data: 8/8 campaigns have cost, total: $150.00
📎 Extracted final URLs for 8 campaigns from ads
📊 Campaigns with Final URLs: 8/8
🔖 Extracted 16 unique channel IDs: ch88087, ch88098, ...
[CHANNEL_MAPPER] Cost preserved: $150.00 in → $150.00 out
🔖 Predicto has 20 unique channel IDs: ch88087, ch88098, ...
💰 Combined cost: 8/20 items have cost, total: $150.00
📊 Matching: 6 with both, 2 cost-only, 12 revenue-only
```

### What You're Seeing:
Paste your actual logs here so I can identify the exact failure point.

---

## Response Format

The API response should look like:

```json
{
  "campaign_aggregated": [
    {
      "campaign_id": "12345678",
      "campaign_name": "My Campaign",
      "channel_ids": ["ch88087"],
      "cost": 75.50,          // ✅ Should be > 0
      "revenue": 120.00,
      "profit": 44.50,
      "roi": 58.94,
      "roas": 1.59,
      "has_cost_data": true,  // ✅ Should be true
      "has_revenue_data": true
    }
  ],
  "summary": {
    "total_cost": 150.00,     // ✅ Should match Google Ads
    "total_revenue": 240.00,
    "total_profit": 90.00,
    "campaigns_matched": 6
  }
}
```

---

## Next Step

**Run the API call and send me the complete server log output** - I'll identify exactly where cost is being lost in the pipeline and we'll fix it.

---

**Status**: Debugging tools added
**Date**: 2026-01-06
**Version**: 1.2.0
