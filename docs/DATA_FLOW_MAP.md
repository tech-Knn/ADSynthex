# 🗺️ Cost & Revenue Data Flow Map

**Complete mapping of Google Ads (Cost) and Ads.com (Revenue) data flow**

---

## 📊 Overview

```
┌─────────────────┐         ┌──────────────────┐
│  Google Ads API │         │   Ads.com API    │
│   (External)    │         │   (External)     │
└────────┬────────┘         └────────┬─────────┘
         │                           │
         │ COST DATA                 │ REVENUE DATA
         ▼                           ▼
┌─────────────────────────────────────────────────┐
│         YOUR APPLICATION LAYER                  │
│  ┌──────────────┐      ┌──────────────┐        │
│  │   Backend    │      │   Backend    │        │
│  │  API Routes  │      │  API Routes  │        │
│  └──────┬───────┘      └──────┬───────┘        │
│         │                     │                 │
│         ▼                     ▼                 │
│  ┌──────────────────────────────────┐          │
│  │      Frontend Components         │          │
│  │  (Dashboard, Analytics, etc.)    │          │
│  └──────────────────────────────────┘          │
└─────────────────────────────────────────────────┘
```

---

## 💰 COST DATA FLOW (Google Ads)

### Step 1: External API
```
Google Ads API (api.google.com)
↓
Returns: campaigns, ad groups, ads, metrics (impressions, clicks, COST)
```

### Step 2: Backend Layer
```
┌─────────────────────────────────────────────────────────────┐
│ File: lib/google-ads-api.ts                                 │
│ Function: fetchGoogleAdsData(startDate, endDate)            │
│ Purpose: Raw Google Ads API client                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ File: lib/bulletproof-google-ads-api.ts                     │
│ Class: BulletproofGoogleAdsAPI                              │
│ Method: getData(startDate, endDate, customerId, options)    │
│ Purpose: Rate limiting + caching + fallback logic           │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ File: app/api/google-ads-production/route.ts                │
│ Endpoint: POST /api/google-ads-production                   │
│ Input: { startDate, endDate, customerId }                   │
│ Output: { ads: [], campaigns: [], total_cost: 0, ... }     │
│ Purpose: Production-ready API endpoint with health checks   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
```

### Step 3: Frontend Layer (Where it's called)

#### 📍 Location 1: Main Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ File: app/dashboard/page.tsx                                │
│ Line: 172-174                                               │
│                                                             │
│ const [adscomData, googleAdsData] = await Promise.all([    │
│   makeApiCall('/api/adscom', {...}),                       │
│   makeApiCall('/api/google-ads-production', {...})         │
│ ]);                                                         │
│                                                             │
│ State: setCostData(googleAdsData.ads)                       │
│ Display: Shows cost metrics, ROI calculation                │
└─────────────────────────────────────────────────────────────┘
```

#### 📍 Location 2: Analytics Page
```
┌─────────────────────────────────────────────────────────────┐
│ File: app/analytics/page.tsx                                │
│ Line: 64-67                                                 │
│                                                             │
│ const costResponse = await axios.post(                     │
│   '/api/google-ads-production',                            │
│   { startDate, endDate }                                   │
│ );                                                          │
│                                                             │
│ State: setCostData(costResponse.data.campaigns)             │
│ Display: Cost analytics and charts                          │
└─────────────────────────────────────────────────────────────┘
```

#### 📍 Location 3: Inuvo Integration
```
┌─────────────────────────────────────────────────────────────┐
│ File: app/api/inuvo/route.ts                                │
│ Line: 51-55                                                 │
│                                                             │
│ const googleAdsResult = await bulletproofAPI.getData(      │
│   startDate, endDate, customerId, {...}                    │
│ );                                                          │
│                                                             │
│ Purpose: Fetch cost data to map with Inuvo revenue         │
└─────────────────────────────────────────────────────────────┘
```

---

## 💵 REVENUE DATA FLOW (Ads.com)

### Step 1: External API
```
Ads.com API (api.ads.com)
↓
Returns: article performance, page views, REVENUE
```

### Step 2: Backend Layer
```
┌─────────────────────────────────────────────────────────────┐
│ File: lib/adscom-api.ts                                     │
│ Function: fetchArticlePerformance(startDate, endDate)       │
│ Function: fetchRevenueData(startDate, endDate)              │
│ Purpose: Ads.com API client                                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ File: app/api/adscom/route.ts                               │
│ Endpoint: POST /api/adscom                                  │
│ Input: { startDate, endDate, customerId }                   │
│ Output: { data: [], total_revenue: 0, ... }                │
│ Purpose: Ads.com revenue endpoint with caching              │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
```

### Step 3: Frontend Layer (Where it's called)

#### 📍 Location 1: Main Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│ File: app/dashboard/page.tsx                                │
│ Line: 172-173                                               │
│                                                             │
│ const [adscomData, googleAdsData] = await Promise.all([    │
│   makeApiCall('/api/adscom', { startDate, endDate }),      │
│   makeApiCall('/api/google-ads-production', {...})         │
│ ]);                                                         │
│                                                             │
│ State: setRevenueData(adscomData.data)                      │
│ Display: Shows revenue metrics, ROI calculation             │
└─────────────────────────────────────────────────────────────┘
```

#### 📍 Location 2: Analytics Page
```
┌─────────────────────────────────────────────────────────────┐
│ File: app/analytics/page.tsx                                │
│ Line: 55-58                                                 │
│                                                             │
│ const revenueResponse = await axios.post(                  │
│   '/api/adscom',                                           │
│   { startDate, endDate }                                   │
│ );                                                          │
│                                                             │
│ State: setRevenueData(revenueResponse.data.data)            │
│ Display: Revenue analytics and charts                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔗 DATA MATCHING (Cost ↔ Revenue)

### Where Matching Happens

```
┌─────────────────────────────────────────────────────────────┐
│ File: app/dashboard/page.tsx                                │
│ Component: DashboardContent                                 │
│                                                             │
│ costData: GoogleAdsAd[]     ← From Google Ads               │
│ revenueData: AdsComData[]   ← From Ads.com                  │
│                                                             │
│ Matching Logic:                                             │
│ - Extract URL slug from Google Ad final_urls                │
│ - Extract URL slug from Ads.com article URLs                │
│ - Match by slug equality                                    │
│                                                             │
│ Example:                                                    │
│   Ad URL: "example.com/article-123?utm=..."               │
│   Article: "example.com/article-123"                       │
│   Slug: "article-123" → MATCH! ✓                          │
└─────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────┐
│ File: components/Dashboard/CostRevenueMapping.tsx           │
│ Component: CostRevenueMapping                               │
│                                                             │
│ Display:                                                    │
│ - Matched items (cost + revenue for same article)          │
│ - Unmatched costs (ads with no revenue)                    │
│ - Unmatched revenue (articles with no ad spend)            │
│ - ROI calculation (revenue / cost)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Complete File & Folder Structure

```
AdSyntheX/
│
├── 🔴 COST DATA (Google Ads) FILES
│   ├── lib/
│   │   ├── google-ads-api.ts              ← Raw Google Ads API client
│   │   ├── bulletproof-google-ads-api.ts  ← Rate limiting + caching wrapper
│   │   ├── smart-rate-limiter.ts          ← Rate limiting logic
│   │   └── unified-cache-manager.ts       ← Caching logic
│   │
│   └── app/api/
│       ├── google-ads-production/
│       │   └── route.ts                   ← Main production endpoint
│       └── google-ads/
│           ├── accounts/route.ts          ← Account management
│           └── quota/route.ts             ← Quota monitoring
│
├── 🟢 REVENUE DATA (Ads.com) FILES
│   ├── lib/
│   │   └── adscom-api.ts                  ← Ads.com API client
│   │
│   └── app/api/
│       └── adscom/
│           ├── route.ts                   ← Main Ads.com endpoint
│           └── validate/route.ts          ← Validation endpoint
│
├── 🔵 FRONTEND PAGES (Uses both)
│   ├── app/
│   │   ├── dashboard/
│   │   │   └── page.tsx                   ← Main dashboard (cost + revenue)
│   │   ├── analytics/
│   │   │   └── page.tsx                   ← Analytics page (cost + revenue)
│   │   └── inuvo-dashboard/
│   │       └── page.tsx                   ← Inuvo-specific dashboard
│   │
│   └── components/
│       └── Dashboard/
│           ├── CostRevenueMapping.tsx     ← Matching visualization
│           ├── SummaryCards.tsx           ← Cost/revenue summary cards
│           ├── DataTable.tsx              ← Data tables
│           └── PerformanceChart.tsx       ← Charts
│
├── 🟡 ALTERNATIVE REVENUE (Inuvo)
│   ├── lib/
│   │   └── inuvo-api.ts                   ← Inuvo API client
│   │
│   └── app/api/
│       └── inuvo/
│           └── route.ts                   ← Inuvo endpoint (cost + revenue)
│
└── 🟣 NEW CLEAN ARCHITECTURE (Future)
    └── src/
        ├── domain/
        │   ├── entities/
        │   │   ├── Ad.ts                  ← Cost entity
        │   │   ├── Revenue.ts             ← Revenue entity
        │   │   └── DashboardMetrics.ts    ← Combined metrics
        │   └── services/
        │       ├── DataMatcher.ts         ← Matching logic
        │       └── MetricsCalculator.ts   ← ROI calculation
        │
        └── infrastructure/
            ├── clients/
            │   ├── GoogleAdsClient.ts     ← New Google Ads client
            │   └── AdsComClient.ts        ← New Ads.com client
            └── mappers/
                ├── GoogleAdsMapper.ts     ← Map to domain entities
                └── AdsComMapper.ts        ← Map to domain entities
```

---

## 🎯 Quick Reference Table

| **Data Type** | **Source** | **Backend File** | **Endpoint** | **Frontend Files** |
|---------------|------------|------------------|--------------|-------------------|
| **COST** | Google Ads | `lib/bulletproof-google-ads-api.ts` | `/api/google-ads-production` | `app/dashboard/page.tsx`<br>`app/analytics/page.tsx` |
| **REVENUE** | Ads.com | `lib/adscom-api.ts` | `/api/adscom` | `app/dashboard/page.tsx`<br>`app/analytics/page.tsx` |
| **REVENUE** (Alt) | Inuvo | `lib/inuvo-api.ts` | `/api/inuvo` | `app/inuvo-dashboard/page.tsx` |
| **MATCHING** | Both | N/A | N/A | `components/Dashboard/CostRevenueMapping.tsx` |

---

## 🔄 Typical Request Flow

### User Opens Dashboard

```
1. User navigates to /dashboard
   ↓
2. app/dashboard/page.tsx loads
   ↓
3. fetchData() function runs
   ↓
4. TWO parallel API calls:
   │
   ├─→ POST /api/google-ads-production
   │   ├─→ lib/bulletproof-google-ads-api.ts
   │   │   └─→ Google Ads API (external)
   │   └─→ Returns: { ads: [], total_cost: X }
   │
   └─→ POST /api/adscom
       ├─→ lib/adscom-api.ts
       │   └─→ Ads.com API (external)
       └─→ Returns: { data: [], total_revenue: Y }
   ↓
5. Data arrives at frontend
   ↓
6. setCostData(ads)      → Store cost data
7. setRevenueData(data)  → Store revenue data
   ↓
8. Matching algorithm runs
   ↓
9. Display:
   - Cost summary cards
   - Revenue summary cards
   - ROI calculation
   - Matched/unmatched items table
```

---

## 🚀 Testing the Flow

### Test Cost Data
```bash
# Call Google Ads API
curl -X POST http://localhost:3000/api/google-ads-production \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-01-01","endDate":"2025-01-31"}'
```

### Test Revenue Data
```bash
# Call Ads.com API
curl -X POST http://localhost:3000/api/adscom \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-01-01","endDate":"2025-01-31"}'
```

### Test Full Dashboard
```
1. npm run dev
2. Open http://localhost:3000/dashboard
3. Select date range
4. Watch both APIs get called in parallel
5. See matched cost/revenue data
```

---

## ✅ Summary

- **COST** = Google Ads → `/api/google-ads-production` → `lib/bulletproof-google-ads-api.ts`
- **REVENUE** = Ads.com → `/api/adscom` → `lib/adscom-api.ts`
- **MATCHING** = Dashboard → URL slug comparison → ROI calculation
- **DISPLAY** = `app/dashboard/page.tsx` + `components/Dashboard/*`

