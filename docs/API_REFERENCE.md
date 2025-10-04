# 📡 API Reference Guide - AdSyntheX

Complete reference for all API endpoints with examples and response formats.

---

## Base URL

- **Development:** `http://localhost:3000`
- **Production:** `https://your-domain.com`

---

## 🔐 Authentication

Currently using middleware-based auth. Check `middleware.ts` for public paths.

---

## 📊 Current Active Endpoints

### 1. Google Ads - Production (Primary)

#### **POST /api/google-ads-production**

Fetch Google Ads data with intelligent caching and rate limiting.

**Request Body:**
```json
{
  "startDate": "2025-10-01",
  "endDate": "2025-10-03",
  "customerId": "8677814915"  // Optional
}
```

**Response (200 OK):**
```json
{
  "ads": [
    {
      "ad_id": "123",
      "customer_id": "8677814915",
      "customer_name": "Ads.com - RSOC - IST",
      "campaign_id": "456",
      "campaign_name": "Campaign Name",
      "campaign_status": "ENABLED",
      "ad_group_id": "789",
      "ad_group_name": "Ad Group Name",
      "ad_group_status": "ENABLED",
      "ad_name": "Ad Name",
      "ad_status": "ENABLED",
      "final_urls": ["https://example.com/article"],
      "metrics": {
        "impressions": 1000,
        "clicks": 50,
        "cost": 25.50,
        "cost_micros": 25500000,
        "conversions": 5,
        "ctr": 5.0,
        "cpc": 0.51,
        "cpa": 5.10,
        "conversion_rate": 10.0
      }
    }
  ],
  "total_cost": 25.50,
  "_source": "cache",
  "_age": 120000,
  "_message": "Served from cache",
  "_systemHealth": {
    "systemHealth": "HEALTHY",
    "usagePercentage": 15.5
  },
  "_loadTime": 45
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/google-ads-production \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-10-01",
    "endDate": "2025-10-03"
  }'
```

---

### 2. Google Ads Accounts

#### **GET /api/google-ads/accounts**

List all accessible Google Ads accounts under MCC.

**Response (200 OK):**
```json
{
  "success": true,
  "mcc_account_id": "1234567890",
  "summary": {
    "total_accounts": 20,
    "managed_accounts": 14,
    "manager_accounts": 1,
    "test_accounts": 5
  },
  "accounts": {
    "all": [...],
    "managed": [
      {
        "id": "8677814915",
        "name": "Ads.com - RSOC - IST",
        "level": 1,
        "status": "ENABLED",
        "currency_code": "USD",
        "time_zone": "America/New_York",
        "is_manager": false,
        "is_test_account": false
      }
    ]
  }
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/google-ads/accounts
```

---

### 3. Google Ads Quota Status

#### **GET /api/google-ads/quota**

Check current API quota and rate limiter status.

**Response (200 OK):**
```json
{
  "quotaStatus": {
    "dailyRequestCount": 150,
    "maxRequestsPerDay": 8000,
    "remainingRequests": 7850,
    "usagePercentage": 1.88,
    "lastRequestTime": "2025-10-03T14:30:00.000Z",
    "resetTime": "2025-10-04T00:00:00.000Z"
  },
  "rateLimiter": {
    "currentQPS": 0.5,
    "targetQPS": 2,
    "systemHealth": "HEALTHY"
  },
  "recommendations": [
    "System is healthy",
    "Rate limiting is working correctly"
  ]
}
```

**cURL Example:**
```bash
curl http://localhost:3000/api/google-ads/quota
```

---

### 4. Ads.com Revenue Data

#### **POST /api/adscom**

Fetch revenue data from Ads.com API.

**Request Body:**
```json
{
  "startDate": "2025-10-01",
  "endDate": "2025-10-03"
}
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "slug": "article-slug",
      "article": "Article Title",
      "visits": 5000,
      "clicks": 250,
      "revenue": 100.50,
      "rpm": 20.10,
      "epc": 0.40,
      "country_data": [
        {
          "country": "us",
          "country_name": "United States",
          "visits": 3000,
          "clicks": 150,
          "revenue": 60.00,
          "rpm": 20.00,
          "epc": 0.40
        }
      ]
    }
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/adscom \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-10-01",
    "endDate": "2025-10-03"
  }'
```

---

## 🔮 Future Endpoints (V2 - Clean Architecture)

### **POST /api/v2/dashboard**

Get complete dashboard data with matched ads and revenue.

**Request Body:**
```json
{
  "startDate": "2025-10-01",
  "endDate": "2025-10-03",
  "customerId": "8677814915"  // Optional
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "metrics": [
      {
        "ad": {
          "id": "123",
          "slug": "article-slug",
          "campaignName": "Campaign Name",
          "metrics": {
            "cost": 25.50,
            "clicks": 50
          }
        },
        "revenue": {
          "slug": "article-slug",
          "revenue": 100.50,
          "visits": 5000
        },
        "profit": 75.00,
        "roi": 294.12,
        "isProfitable": true
      }
    ],
    "aggregates": {
      "totalCost": 25.50,
      "totalRevenue": 100.50,
      "totalProfit": 75.00,
      "averageROI": 294.12,
      "profitableCount": 1,
      "losingCount": 0
    },
    "matchingStats": {
      "totalAds": 10,
      "totalRevenues": 15,
      "matched": 8,
      "unmatched": 2,
      "matchRate": 80.0
    }
  },
  "meta": {
    "dateRange": "2025-10-01 to 2025-10-03",
    "loadTime": 1250,
    "source": "cache"
  }
}
```

---

## ❌ Error Responses

### Standard Error Format

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

### Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `EXTERNAL_SERVICE_ERROR` | 502 | Third-party API error |
| `INTERNAL_ERROR` | 500 | Server error |

### Example Error Response

```json
{
  "success": false,
  "error": {
    "message": "Start date is required",
    "code": "VALIDATION_ERROR"
  }
}
```

**Status:** 400 Bad Request

---

## 📝 Request/Response Notes

### Date Format
- All dates must be in `YYYY-MM-DD` format
- Example: `2025-10-03`

### Customer ID
- Optional filter for specific Google Ads account
- Use account ID from `/api/google-ads/accounts`
- Omit to get data from all accounts

### Caching
- Responses include `_source` field indicating data source
- `cache`: Served from cache
- `api`: Fresh from Google Ads API
- `stale`: Stale cache (fallback)

### Rate Limiting
- Google Ads API: Max 8,000 requests/day
- System respects Google's rate limits automatically
- Check `/api/google-ads/quota` for current status

---

## 🧪 Testing Endpoints

### Using cURL

```bash
# Test Google Ads endpoint
curl -X POST http://localhost:3000/api/google-ads-production \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-10-01","endDate":"2025-10-03"}'

# Test Accounts endpoint
curl http://localhost:3000/api/google-ads/accounts

# Test Quota endpoint
curl http://localhost:3000/api/google-ads/quota
```

### Using JavaScript/TypeScript

```typescript
// Fetch Google Ads data
const response = await fetch('/api/google-ads-production', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startDate: '2025-10-01',
    endDate: '2025-10-03'
  })
});

const data = await response.json();
console.log(data.ads);
```

### Using the Domain Layer (New)

```typescript
import { GoogleAdsMapper } from '@/src/infrastructure/mappers/GoogleAdsMapper';
import { DataMatcher } from '@/src/domain/services/DataMatcher';

// Fetch and map
const response = await fetch('/api/google-ads-production', {/*...*/});
const rawData = await response.json();
const ads = GoogleAdsMapper.toDomainList(rawData.ads);

// Use domain services
const matcher = new DataMatcher();
const metrics = matcher.matchAdsWithRevenue(ads, revenues);
```

---

## 📚 Additional Resources

- **Complete Guide:** `docs/COMPLETE_IMPLEMENTATION_GUIDE.md`
- **Architecture:** `docs/ARCHITECTURE_ANALYSIS.md`
- **Onboarding:** `docs/onboarding.md`

---

