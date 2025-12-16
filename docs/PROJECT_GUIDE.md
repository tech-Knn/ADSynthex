# 📘 AdSyntheX - Complete Project Guide
---

## 🎯 Quick Start

### Installation
```bash
git clone https://github.com/nagdewaniharen/AdSyntheX.git
cd AdSyntheX
npm install
```

### Environment Setup
Create `.env.local`:
```env
# Google Ads API
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
GOOGLE_ADS_MANAGER_ID=your_manager_id

# Ads.com API
ADSCOM_API_KEY=your_api_key
ADSCOM_API_SECRET=your_api_secret
```

### Run
```bash
npm run dev
# Open http://localhost:3000
```

---

## 📁 Project Structure

```
AdSyntheX/
├── src/                        # Clean Architecture
│   ├── domain/                 # Business Logic (Pure)
│   │   ├── entities/          # Ad, Revenue, DashboardMetrics
│   │   ├── value-objects/     # DateRange
│   │   ├── repositories/      # Interfaces (IAdRepository, etc.)
│   │   └── services/          # DataMatcher, MetricsCalculator
│   │
│   ├── infrastructure/         # External Systems
│   │   ├── cache/             # CacheProvider
│   │   ├── clients/           # GoogleAdsClient, AdsComClient
│   │   ├── config/            # GoogleAdsConfig
│   │   ├── di/                # Dependency Injection Container
│   │   └── mappers/           # GoogleAdsMapper, AdsComMapper
│   │
│   └── shared/                 # Utilities
│       ├── constants/         # TARGET_ACCOUNTS, CACHE_TTL
│       └── errors/            # AppError, ErrorHandler
│
├── app/api/                    # Next.js API Routes
│   ├── google-ads-production/ # Main Google Ads endpoint
│   ├── google-ads/
│   │   ├── accounts/          # List accounts
│   │   └── quota/             # Check quota status
│   └── adscom/                # Revenue data endpoint
│
├── components/                 # React Components
│   ├── Dashboard/             # Dashboard components
│   ├── Layout/                # Layout components
│   └── Providers/             # Context providers
│
├── lib/                        # Legacy (being phased out)
│   ├── unified-cache-manager.ts
│   ├── production-rate-manager.ts
│   └── bulletproof-google-ads-api.ts
│
└── docs/                       # Documentation
    ├── PROJECT_GUIDE.md       # This file
    ├── API_REFERENCE.md       # API documentation
    └── ARCHITECTURE.md        # Architecture details
```

---

## 🏗️ Architecture

### Clean Architecture Layers

```
┌────────────────────────────────────┐
│  API Routes (Thin Controllers)     │  ← app/api/
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  Use Cases (Coming Soon)           │  ← src/application/
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  Domain Layer (Business Logic)     │  ← src/domain/
│  - Pure TypeScript                 │
│  - Zero dependencies               │
│  - Testable                        │
└──────────────┬─────────────────────┘
               ↓
┌────────────────────────────────────┐
│  Infrastructure (External APIs)    │  ← src/infrastructure/
│  - Google Ads Client               │
│  - Ads.com Client                  │
│  - Cache Provider                  │
└────────────────────────────────────┘
```

### Key Principles

1. **Domain First** - Business logic in pure TypeScript
2. **Dependency Inversion** - High-level doesn't depend on low-level
3. **Single Responsibility** - One class, one purpose
4. **Testability** - Pure functions, easy to mock

---

## 🔌 API Endpoints

### 1. Get Google Ads Data
```bash
POST /api/google-ads-production
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-03",
  "customerId": "8677814915"  // Optional
}
```

**Response:**
```json
{
  "ads": [...],
  "total_cost": 125.50,
  "_source": "cache",
  "_loadTime": 45
}
```

### 2. List Accounts
```bash
GET /api/google-ads/accounts
```

### 3. Check Quota
```bash
GET /api/google-ads/quota
```

### 4. Get Revenue Data
```bash
POST /api/adscom
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-03"
}
```

See **API_REFERENCE.md** for complete details.

---

## 💻 Code Examples

### Using Domain Entities

```typescript
import { Ad } from '@/src/domain/entities/Ad';
import { Revenue } from '@/src/domain/entities/Revenue';
import { DashboardMetrics } from '@/src/domain/entities/DashboardMetrics';

// Create entities
const ad = new Ad(/*...*/);
const revenue = new Revenue(/*...*/);

// Combine for metrics
const metrics = new DashboardMetrics(ad, revenue);
console.log(metrics.profit);      // 75.00
console.log(metrics.roi);          // 294.12%
console.log(metrics.isProfitable); // true
```

### Using Mappers

```typescript
import { GoogleAdsMapper } from '@/src/infrastructure/mappers/GoogleAdsMapper';

// Fetch from API
const response = await fetch('/api/google-ads-production', {/*...*/});
const data = await response.json();

// Map to domain entities
const ads = GoogleAdsMapper.toDomainList(data.ads);

// Now use business logic
ads.forEach(ad => {
  console.log(ad.slug);     // Auto-extracted
  console.log(ad.isActive); // Calculated
});
```

### Using Domain Services

```typescript
import { DataMatcher } from '@/src/domain/services/DataMatcher';
import { MetricsCalculator } from '@/src/domain/services/MetricsCalculator';

const matcher = new DataMatcher();
const calculator = new MetricsCalculator();

// Match ads with revenue
const metrics = matcher.matchAdsWithRevenue(ads, revenues);

// Get top performers
const topPerformers = matcher.findTopPerformers(metrics, 10);

// Calculate totals
const totals = calculator.calculateAggregate(metrics);
console.log(totals.totalProfit);
console.log(totals.averageROI);
```

### Error Handling

```typescript
import { ValidationError } from '@/src/shared/errors/AppError';
import { handleApiError } from '@/src/shared/errors/ErrorHandler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.startDate) {
      throw new ValidationError('Start date is required');
    }
    
    // ... logic
    
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## 🧪 Testing

### Run Tests
```bash
npm test                # All tests
npm run test:unit       # Unit tests
npm run test:integration # Integration tests
```

### Example Unit Test
```typescript
import { describe, it, expect } from 'vitest';
import { Ad } from '@/src/domain/entities/Ad';

describe('Ad Entity', () => {
  it('should extract slug from URL', () => {
    const ad = new Ad(
      'ad1', 'cust1', 'Customer', 'camp1', 'Campaign',
      'ENABLED', 'ag1', 'AdGroup', 'ENABLED', 'Ad', 'ENABLED',
      ['https://example.com/my-article'],
      { impressions: 100, clicks: 10, cost: 5, conversions: 1, ctr: 10, cpc: 0.5 }
    );

    expect(ad.slug).toBe('my-article');
    expect(ad.isActive).toBe(true);
  });
});
```

---

## 🔧 Configuration

### Target Accounts
Edit `src/shared/constants/googleAds.ts`:
```typescript
export const TARGET_ACCOUNTS = [
  { id: '8677814915', name: 'Ads.com - RSOC - IST' },
  // Add more accounts...
];
```

### Cache TTL
```typescript
export const CACHE_TTL = {
  individual: 10 * 60,  // 10 minutes
  aggregated: 15 * 60,  // 15 minutes
  historical: 60 * 60   // 1 hour
};
```

---

## 📊 Key Features

- ✅ **Real-time Dashboard** - Combined Google Ads + Revenue data
- ✅ **Smart Caching** - Intelligent cache with auto-refresh
- ✅ **Rate Limiting** - Never exceed Google API limits
- ✅ **ROI Tracking** - Profit, ROI, ROAS calculations
- ✅ **Country Breakdown** - Revenue by country
- ✅ **Clean Architecture** - Maintainable, testable code

---

## 🚀 Deployment

### Build
```bash
npm run build
```

### Deploy to Vercel
```bash
vercel deploy
```

### Environment Variables
Set in deployment platform:
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_MANAGER_ID`
- `ADSCOM_API_KEY`
- `ADSCOM_API_SECRET`

---

## 🛠️ Troubleshooting

### Issue: Rate Limit Errors
**Solution:** Check `/api/google-ads/quota` endpoint. System auto-manages rate limits.

### Issue: Missing ENV vars
**Solution:** Verify `.env.local` has all required variables.

### Issue: Build Errors
**Solution:** Run `npm run lint && npx tsc --noEmit`

---

## 📚 Additional Documentation

- **API_REFERENCE.md** - Complete API documentation
- **ARCHITECTURE.md** - Detailed architecture guide
- **onboarding.md** - Setup instructions

---

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit PR

---

## 📝 License

MIT License - See LICENSE file

---

**Questions?** Check other documentation or contact the team.

