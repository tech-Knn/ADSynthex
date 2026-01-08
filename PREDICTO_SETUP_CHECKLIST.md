# Predicto Setup Checklist

Complete these steps to get Predicto running in your dashboard.

## ✅ Step 1: Add Environment Variables

Edit `.env.local` and add:

```bash
# Predicto API Configuration
PREDICTO_API_URL=https://dashboard-server.predicto.ai
PREDICTO_AUTH_TOKEN=your_actual_bearer_token_here
```

**How to get the bearer token:**
1. Log in to https://dashboard-server.predicto.ai
2. Go to Settings → API Access (or similar section)
3. Generate/copy your API token
4. Paste it in `.env.local`

---

## ✅ Step 2: Add Your Predicto Accounts

### Option A: Add to Account Access Control (Recommended)

Edit `lib/account-access-control.ts`:

```typescript
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // Add your Predicto-enabled accounts
  'CID_1234567890': ['predicto'],
  'CID_0987654321': ['predicto'],

  // Or combine with other feeds
  'CID_5555555555': ['adscom', 'predicto'],

  // ... existing accounts
};
```

### Option B: Add to Page Component

Edit `app/predicto/page.tsx` and update the `PREDICTO_ENABLED_ACCOUNTS` array:

```typescript
const PREDICTO_ENABLED_ACCOUNTS: Account[] = [
  { id: '1234567890', name: 'Predicto - Account 1' },
  { id: '0987654321', name: 'Predicto - Account 2' },
  { id: '5555555555', name: 'Predicto - My Campaign Account' },
  // Add more accounts here
];
```

**Note**: Use the Google Ads customer ID (without `CID_` prefix)

---

## ✅ Step 3: Generate Tracking URLs

1. Navigate to http://localhost:3000/predicto
2. Click on the **"URL Builder"** tab
3. Enter:
   - **Domain**: Your landing page domain (e.g., `example.com`)
   - **Article/Search ID**: Article identifier (e.g., `tech-news-123`)
   - **Channel ID**: Your channel ID (e.g., `channel-gdn-001`)
4. Click **"Generate Tracking URL"**
5. Copy the generated URL

Example generated URL:
```
https://example.com/asrsearch?search=tech-news-123&source=googleads&cid=channel-gdn-001&campaign_id={campaignid}&adset_id={adgroupid}&ad_id={creative}&account_id={customerid}&event=lead
```

---

## ✅ Step 4: Set Up Google Ads Campaigns

1. Go to Google Ads → Campaigns
2. Create or edit a **Google Display Network (GDN)** campaign
3. At the ad or ad group level, set the **Final URL** to your generated tracking URL
4. Save the campaign
5. When ads are clicked, Google Ads will automatically replace the macros:
   - `{campaignid}` → Actual campaign ID
   - `{adgroupid}` → Actual ad group ID
   - `{creative}` → Actual creative/ad ID
   - `{customerid}` → Actual customer ID

---

## ✅ Step 5: Verify Tracking

### Test the URL:
1. Click on one of your ads
2. Check the URL in the browser address bar
3. Verify macros are replaced with actual IDs

Example of what you should see:
```
https://example.com/asrsearch?search=tech-news-123&source=googleads&cid=channel-gdn-001&campaign_id=12345678&adset_id=87654321&ad_id=45678912&account_id=1234567890&event=lead
```

### Check Predicto Dashboard:
1. Log in to https://dashboard-server.predicto.ai
2. Check if revenue data is being tracked
3. Verify the `campaign_id` is appearing in the data

---

## ✅ Step 6: View Cost-Revenue Dashboard

1. Navigate to http://localhost:3000/predicto
2. Select your account from the dropdown
3. Choose a date range (start with last 7 days)
4. Click **"Refresh"**
5. View your cost-revenue data:
   - Total Cost, Revenue, Profit
   - ROI and ROAS metrics
   - Campaign-level breakdown
   - Top performing campaigns chart

---

## ✅ Step 7: Test the API Endpoints

### Test Revenue Fetch:
```bash
curl -X POST http://localhost:3000/api/predicto \
  -H "Content-Type: application/json" \
  -d '{
    "action": "revenue-by-campaign",
    "startDate": "2024-01-01",
    "endDate": "2024-01-31"
  }'
```

### Test Cost-Revenue Mapping:
```bash
curl -X POST http://localhost:3000/api/predicto-cost-revenue \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "customerId": "1234567890"
  }'
```

---

## Troubleshooting

### Issue: "No Predicto Accounts" message

**Solution**: Make sure you've added your accounts to either:
- `lib/account-access-control.ts` → `ACCOUNT_FEED_ACCESS`
- OR `app/predicto/page.tsx` → `PREDICTO_ENABLED_ACCOUNTS`

### Issue: API returns 401 Unauthorized

**Solution**: Check your `PREDICTO_AUTH_TOKEN` in `.env.local`
- Make sure there are no extra spaces
- Verify the token is still valid
- Try regenerating the token in Predicto dashboard

### Issue: No revenue data showing

**Possible causes**:
1. Tracking URL not set up in Google Ads yet
2. No traffic/clicks yet (wait 24 hours)
3. Campaign ID mismatch
4. Predicto API issue

**Solution**:
- Verify tracking URL is correct
- Check Predicto dashboard directly
- Ensure campaign IDs match between Google Ads and Predicto

### Issue: 404 Not Found for /predicto page

**Solution**: Make sure you've created `app/predicto/page.tsx`

### Issue: TypeScript errors

**Solution**: Run `npm run build` to check for errors, or restart your dev server

---

## Quick Reference

### File Locations:
- **Main Page**: `app/predicto/page.tsx`
- **Dashboard Component**: `components/Predicto/PredictoCostRevenueMapping.tsx`
- **URL Builder**: `components/Predicto/PredictoUrlBuilder.tsx`
- **API Routes**:
  - `app/api/predicto/route.ts`
  - `app/api/predicto-cost-revenue/route.ts`
- **Access Control**: `lib/account-access-control.ts`

### API Endpoints:
- `/api/predicto` - Revenue data & URL generation
- `/api/predicto-cost-revenue` - Cost-revenue mapping

### Key URLs:
- Dashboard: http://localhost:3000/predicto
- Predicto API: https://dashboard-server.predicto.ai/api/search/reporting/

---

## Next Steps After Setup

1. **Run campaigns for 24-48 hours** to gather data
2. **Monitor performance** in the dashboard
3. **Optimize campaigns** based on ROI/ROAS metrics
4. **Create more tracking URLs** for different articles/channels
5. **Set up alerts** for profitable/unprofitable campaigns (future feature)

---

## Support

- **Predicto Issues**: Contact Predicto support at support@predicto.ai
- **Integration Issues**: Check `PREDICTO_INTEGRATION_GUIDE.md`
- **General Questions**: Review `PREDICTO_IMPLEMENTATION_SUMMARY.md`

---

**Congratulations!** Once you complete these steps, your Predicto integration will be fully operational. 🎉
