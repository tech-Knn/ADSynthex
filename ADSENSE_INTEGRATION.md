# AdSense for Search (AFS) Integration

## Overview
The AFS feed has been integrated into AdSyntheX to map Google Ads campaign costs with AdSense revenue based on **style_id**, **country_name**, and **domain**.

## Architecture

### 1. AdSense API Client (`lib/adsense-api.ts`)
- Authenticates with Google AdSense API using OAuth2
- Fetches revenue data with dimensions: DATE, CUSTOM_SEARCH_STYLE_ID, COUNTRY_NAME, DOMAIN_NAME
- Extracts style_id and domain from campaign URLs

### 2. Cost/Revenue Mapping API (`app/api/adsense-cost-revenue/route.ts`)
- Fetches Google Ads campaign data (filtered by adsense feed type)
- Fetches AdSense revenue data in parallel
- Matches revenue to campaigns using: **date + style_id + country + domain**
- Returns aggregated campaign-level profit/loss data

### 3. Feed Type Configuration (`lib/account-access-control.ts`)
- Added 'adsense' to FeedType enum
- Configured routes: `/adsense`, `/api/adsense-cost-revenue`
- Account access control ready for configuration

## Matching Logic

### URL Structure
Campaign URLs must contain `style_id` parameter:
```
https://termux.dev/search?q=keyword&style_id=12345678
```

### Matching Strategy
1. Extract `style_id` and `domain` from campaign URLs
2. Query AdSense with dimensions: DATE, CUSTOM_SEARCH_STYLE_ID, COUNTRY_NAME, DOMAIN_NAME
3. Match using lookup keys:
   - Primary: `date_styleId_country_domain`
   - Fallback 1: `date_styleId_ALL_domain`
   - Fallback 2: `date_styleId_ALL_ALL`

### Revenue Attribution
- Each campaign can have multiple style_ids and domains
- Revenue is aggregated across all matches
- AdSense clicks are treated as conversions

## Configuration Steps

### 1. Environment Variables
**Good News:** AdSense API uses the same OAuth credentials as Google Ads!

Your existing `.env.local` already has everything needed:
```bash
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
```

No additional environment variables required! The system will automatically fetch your AdSense accounts using the OAuth token.

### 2. Google OAuth Setup
1. Enable AdSense Management API in your existing Google Cloud Console project
   - Go to: https://console.cloud.google.com/apis/library
   - Search for "AdSense Management API"
   - Click "Enable"
2. Add OAuth scope to your existing consent screen: `https://www.googleapis.com/auth/adsense.readonly`
3. Your existing refresh token will work for both Google Ads and AdSense APIs

### 3. Account Assignment
Add your Google Ads accounts to `lib/account-access-control.ts` with 'adsense' feed type:
```typescript
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // Add your AFS Google Ads accounts here
  'CID_1234567890': ['adsense'],
  'CID_0987654321': ['adsense'],

  // Existing accounts...
  'CID_5416418019': ['compado'],
  // ...
};
```

**Note:** The system will automatically fetch all your AdSense accounts from the AdSense API. You just need to map which Google Ads accounts have the 'adsense' feed access.

## API Usage

### Request
```typescript
POST /api/adsense-cost-revenue
{
  "startDate": "2025-01-01",
  "endDate": "2025-01-31",
  "customerId": "1234567890",
  "adsenseAccountId": "accounts/pub-1234567890",
  "forceRefresh": false
}
```

### Response
```typescript
{
  "campaign_aggregated": [
    {
      "campaign_id": "12345",
      "campaign_name": "Search Campaign",
      "style_id": "87654321",
      "domain": "termux.dev",
      "cost": 1000.00,
      "revenue": 1200.00,
      "profit": 200.00,
      "roi": 20.00,
      "roas": 1.20
    }
  ],
  "summary": {
    "totalCost": 10000.00,
    "totalRevenue": 12000.00,
    "totalProfit": 2000.00,
    "overallROI": 20.00,
    "overallROAS": 1.20
  }
}
```

## Integration with Dashboard

### Metrics Table
The AdSense feed will appear in the metrics table alongside other feeds:
- Cost (from Google Ads)
- Revenue (from AdSense API)
- Profit (Revenue - Cost)
- ROI ((Profit / Cost) * 100)
- ROAS (Revenue / Cost)

### Filtering
- Feed isolation ensures only AdSense accounts are included
- No data mixing with Compado or Ads.com feeds
- Campaign-level granularity with style_id tracking

## Notes

### Channel ID Deprecated
- **DO NOT** use channel_id for matching
- Only use style_id, country, and domain
- Channel ID is no longer provided by AdSense API

### Performance
- Parallel data fetching (Google Ads + AdSense)
- Redis caching for both APIs
- Rate limit protection with fallback to stale cache

### Data Freshness
- Cache TTL: 5 minutes (configurable)
- Force refresh available via API parameter
- Cooldown-aware to prevent rate limit errors

## How It Works

### Account Setup (Dynamic)
The AFS page automatically:
1. **Fetches Google Ads accounts** with 'adsense' feed access from `/api/google-ads/accounts`
2. **Fetches AdSense accounts** from AdSense API via `/api/adsense-accounts`
3. **Displays dropdowns** for both account types
4. **Filters accounts** based on user permissions (admin sees all, regular users see only their account)

### Usage Flow
1. Login to AdSyntheX
2. Navigate to "AFS" in the sidebar
3. System automatically loads:
   - Your Google Ads accounts (with AFS access)
   - Your AdSense publisher accounts
4. Select accounts and date range
5. Click "Fetch Data"
6. View cost/revenue mapping with profit/ROI

### APIs Created
- `GET /api/adsense-accounts` - Fetches all AdSense publisher accounts
- `POST /api/adsense-cost-revenue` - Maps Google Ads cost to AdSense revenue
