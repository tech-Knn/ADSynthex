# Predicto Integration Guide

## Overview

Predicto is integrated as a revenue partner in the Adsynthex dashboard, providing campaign-level revenue tracking using direct campaign_id matching with Google Ads cost data.

## Key Features

- **Direct Campaign ID Matching**: Revenue is matched to cost data using campaign_id (simpler than GCLID-based tracking)
- **URL Builder**: Generate tracking URLs for Google Ads GDN campaigns with automatic macro replacement
- **Cost-Revenue Dashboard**: View campaign performance with ROI, ROAS, and profit metrics
- **Account Access Control**: Integrated with existing account permissions system
- **Redis Caching**: 15-minute cache TTL for optimal performance

## Environment Variables

Add the following variables to your `.env` or `.env.local` file:

```bash
# Predicto API Configuration
PREDICTO_API_URL=https://dashboard-server.predicto.ai
PREDICTO_AUTH_TOKEN=your_bearer_token_here
```

### Getting Your Predicto API Token

1. Log in to your Predicto dashboard at https://dashboard-server.predicto.ai
2. Navigate to Settings → API Access
3. Generate a new API token or copy your existing token
4. Add the token to your environment variables

## API Endpoints

### 1. Predicto Revenue Data (`/api/predicto`)

Fetch revenue data from Predicto or generate tracking URLs.

#### Generate Tracking URL

```bash
POST /api/predicto
Content-Type: application/json

{
  "action": "generate-url",
  "domain": "example.com",
  "articleId": "tech-news-123",
  "channelId": "channel-gdn-001"
}
```

Response:
```json
{
  "success": true,
  "url": "https://example.com/asrsearch?search=tech-news-123&source=googleads&cid=channel-gdn-001&campaign_id={campaignid}&adset_id={adgroupid}&ad_id={creative}&account_id={customerid}&event=lead",
  "template": "...",
  "params": { ... },
  "macros": { ... }
}
```

#### Fetch Revenue by Campaign

```bash
POST /api/predicto
Content-Type: application/json

{
  "action": "revenue-by-campaign",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31"
}
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "campaign_id": "12345678",
      "impressions": 10000,
      "clicks": 250,
      "revenue": 150.75,
      "ctr": 2.5,
      "rpc": 0.603
    }
  ],
  "total_campaigns": 10
}
```

### 2. Predicto Cost-Revenue Mapping (`/api/predicto-cost-revenue`)

Fetch combined Google Ads cost and Predicto revenue data.

```bash
POST /api/predicto-cost-revenue
Content-Type: application/json

{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "customerId": "1234567890",  // Single account
  "forceRefresh": false
}
```

Or for multiple accounts:
```bash
{
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "accountIds": ["1234567890", "0987654321"],
  "forceRefresh": false
}
```

Response:
```json
{
  "campaign_aggregated": [
    {
      "campaign_id": "12345678",
      "campaign_name": "GDN Campaign 1",
      "cost": 100.50,
      "clicks": 250,
      "impressions": 10000,
      "revenue": 150.75,
      "profit": 50.25,
      "roi": 50.0,
      "roas": 1.5,
      "has_cost_data": true,
      "has_revenue_data": true
    }
  ],
  "summary": {
    "total_campaigns": 10,
    "campaigns_matched": 8,
    "total_cost": 1000.00,
    "total_revenue": 1500.00,
    "total_profit": 500.00,
    "average_roi": 50.0,
    "match_rate": 80.0
  },
  "_source": "redis-aggregated-cache",
  "_timestamp": "2024-01-31T12:00:00.000Z"
}
```

## Setting Up Google Ads Campaigns

### Step 1: Generate Tracking URL

Use the URL Builder component or API to generate your tracking URL:

1. **Domain**: Your landing page domain (e.g., `example.com`)
2. **Article/Search ID**: The article or search parameter (e.g., `tech-news-123`)
3. **Channel ID**: Your channel identifier (e.g., `channel-gdn-001`)

### Step 2: Configure Google Ads

1. Create or edit a GDN campaign in Google Ads
2. At the ad or ad group level, add the generated URL as your **Final URL**
3. Google Ads will automatically replace macros when ads are clicked:
   - `{campaignid}` → Actual campaign ID
   - `{adgroupid}` → Actual ad group ID
   - `{creative}` → Actual creative/ad ID
   - `{customerid}` → Actual customer/account ID

### Step 3: Verify Tracking

After launching your campaign:

1. Click on one of your ads
2. Check the URL in the browser address bar
3. Verify that the macros have been replaced with actual IDs
4. Check Predicto dashboard to confirm tracking is working

Example of replaced URL:
```
https://example.com/asrsearch?search=tech-news-123&source=googleads&cid=channel-gdn-001&campaign_id=12345678&adset_id=87654321&ad_id=45678912&account_id=1234567890&event=lead
```

## Campaign ID Mapping Logic

### How It Works

1. **Google Ads**: Fetches campaign data with `campaign_id`, cost, clicks, impressions
2. **Predicto**: Fetches revenue data with `campaign_id`, revenue, clicks, impressions
3. **Mapping**: Joins both datasets on `campaign_id` (normalized)
4. **Calculation**: Computes profit, ROI, ROAS, and other metrics

### Normalization

Campaign IDs are normalized before matching:
- Converted to string
- Trimmed of whitespace
- Ensures consistent matching between Google Ads and Predicto

### Data Quality Indicators

Each campaign in the mapping includes:
- `has_cost_data`: True if Google Ads data exists
- `has_revenue_data`: True if Predicto revenue exists
- Campaigns with both = **Matched**
- Campaigns with only cost = **Cost Only** (no revenue yet)
- Campaigns with only revenue = **Revenue Only** (cost data missing)

## Dashboard Components

### PredictoCostRevenueMapping

Main dashboard component showing:
- Summary cards (Total Cost, Revenue, Profit, ROI)
- Profitability overview with match rate
- Top 10 campaigns chart
- Detailed table with all campaigns

```tsx
import PredictoCostRevenueMapping from '@/components/Predicto/PredictoCostRevenueMapping';

<PredictoCostRevenueMapping
  data={campaignMappings}
  summary={summary}
  loading={false}
/>
```

### PredictoUrlBuilder

URL generator component for creating tracking URLs:

```tsx
import PredictoUrlBuilder from '@/components/Predicto/PredictoUrlBuilder';

<PredictoUrlBuilder />
```

## Account Access Control

### Adding Predicto Access to Accounts

Edit `/lib/account-access-control.ts`:

```typescript
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // Add 'predicto' to allowed feeds for specific accounts
  'CID_1234567890': ['predicto'],
  'CID_0987654321': ['predicto'],

  // Or combine with other feeds
  'CID_5555555555': ['adscom', 'predicto'],
};
```

### Feed Routes

The following routes are protected by access control:
- `/predicto` - Main dashboard
- `/api/predicto` - Revenue data API
- `/api/predicto-cost-revenue` - Cost-revenue mapping API

## Rate Limiting & Caching

### API Rate Limits

Predicto API has the following limits:
- **100 calls per hour**
- **90 days max data range per request**

The integration automatically handles these limits with:
- Redis caching (15-minute TTL)
- Aggregated cache for faster responses
- Batch processing for multi-account requests

### Cache Strategy

1. **First Request**: Fetches from Predicto API and Google Ads API, caches result
2. **Subsequent Requests**: Serves from Redis cache (sub-second response)
3. **Force Refresh**: Clears cache and fetches fresh data (respects rate limits)
4. **Cache TTL**: 15-30 minutes (configurable)

## Troubleshooting

### No Revenue Data

**Symptoms**: Campaigns show cost but no revenue

**Possible Causes**:
1. Tracking URL not set up correctly in Google Ads
2. Macros not being replaced by Google Ads
3. Predicto not receiving traffic yet
4. Campaign ID mismatch

**Solutions**:
- Verify tracking URL is correct
- Check browser URL after clicking ad
- Wait 24 hours for data to populate
- Check Predicto dashboard directly

### Campaign ID Mismatch

**Symptoms**: High cost but zero revenue, or vice versa

**Possible Causes**:
1. Different campaign IDs in Google Ads vs Predicto
2. Data from different date ranges
3. Campaign was recreated (new ID)

**Solutions**:
- Verify campaign ID matches in both systems
- Ensure date ranges overlap
- Use wider date range to catch delayed conversions

### API Authentication Errors

**Symptoms**: 401 Unauthorized or 403 Forbidden

**Solutions**:
1. Check `PREDICTO_AUTH_TOKEN` is set correctly
2. Verify token is not expired
3. Regenerate token in Predicto dashboard
4. Ensure token has proper API permissions

## Database Schema

### Cost Collection: `predicto_cost`

```typescript
{
  account_id: string,
  campaign_id: string,
  campaign_name: string,
  date: string, // YYYY-MM-DD
  cost_micros: number,
  clicks: number,
  impressions: number,
  conversions: number,
  feed_type: 'predicto'
}
```

### Revenue Collection: `predicto_revenue`

```typescript
{
  campaign_id: string,
  date: string, // YYYY-MM-DD
  revenue_usd: number,
  clicks: number,
  impressions: number,
  feed_type: 'predicto'
}
```

## Performance Optimization

### Best Practices

1. **Use Smaller Date Ranges**: 7-14 days for faster loading
2. **Leverage Cache**: Avoid force refresh unless necessary
3. **Batch Accounts**: Process multiple accounts in parallel
4. **Monitor Quota**: Keep Google Ads API usage under 90%

### Expected Response Times

- **Cached Response**: < 1 second
- **Single Account (7 days)**: 2-5 seconds
- **Single Account (30 days)**: 5-10 seconds
- **Multi-Account (5 accounts)**: 10-20 seconds

## Support & Resources

- **Predicto API Docs**: https://dashboard-server.predicto.ai/api/docs
- **Google Ads Macros**: https://support.google.com/google-ads/answer/6305348

## Version History

- **v1.0** (2024-01-05): Initial Predicto integration
  - Campaign ID-based revenue tracking
  - URL builder for GDN campaigns
  - Cost-revenue mapping dashboard
  - Redis caching and rate limiting
