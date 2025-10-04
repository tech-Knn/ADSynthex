# 🏗️ AdSyntheX - Architecture Documentation
---

## 📊 Architecture Overview

### Clean Architecture Pattern

```
┌──────────────────────────────────────────────────┐
│            Presentation Layer                     │
│     (API Routes, React Components)               │
│  app/api/* → Thin controllers                    │
└───────────────────┬──────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│         Application Layer (Future)                │
│     (Use Cases, Application Services)            │
│  src/application/* → Business workflows          │
└───────────────────┬──────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│              Domain Layer                         │
│        (Business Logic - Pure)                   │
│  src/domain/*                                    │
│  ✓ Zero external dependencies                   │
│  ✓ Pure TypeScript                              │
│  ✓ 100% testable                                │
└───────────────────┬──────────────────────────────┘
                    ↓
┌──────────────────────────────────────────────────┐
│         Infrastructure Layer                      │
│    (External Systems Integration)                │
│  src/infrastructure/*                            │
│  - Google Ads API Client                        │
│  - Ads.com API Client                           │
│  - Cache Provider                               │
│  - Mappers (DTO ↔ Entity)                      │
└──────────────────────────────────────────────────┘
```

---

## 🎯 Layer Responsibilities

### 1. Domain Layer (`src/domain/`)

**Purpose:** Pure business logic, independent of frameworks and external systems.

**Components:**

#### Entities
- **Ad** - Represents a Google Ads advertisement
  - Auto-extracts slug from URL
  - Calculates derived metrics (CPA, active status)
  - Business logic for cost calculations

- **Revenue** - Represents revenue data from Ads.com
  - CTR calculations
  - Country breakdown analysis
  - Top performer identification

- **DashboardMetrics** - Combines Ad + Revenue
  - Profit calculation (revenue - cost)
  - ROI calculation ((profit / cost) × 100)
  - ROAS calculation (revenue / cost)
  - Profitability status

#### Value Objects
- **DateRange** - Immutable date range with validation

#### Repository Interfaces (Ports)
- **IAdRepository** - Contract for ad data access
- **IRevenueRepository** - Contract for revenue data access
- **ICacheProvider** - Contract for caching

#### Domain Services
- **DataMatcher** - Matches ads with revenue by slug
- **MetricsCalculator** - Calculates aggregate metrics

**Rules:**
- ✅ No imports from other layers
- ✅ Pure TypeScript classes
- ✅ Business logic only
- ✅ Framework-agnostic

---

### 2. Infrastructure Layer (`src/infrastructure/`)

**Purpose:** Implements domain interfaces and handles external systems.

**Components:**

#### Clients
- **GoogleAdsClient** - Google Ads API communication
  - Query ads by date range
  - Query all target accounts
  - Get account list

- **AdsComClient** - Ads.com API communication
  - Fetch revenue data
  - Validate credentials

#### Cache
- **CacheProvider** - Implements ICacheProvider
  - Bridges to unified-cache-manager
  - Key-value storage
  - TTL management

#### Mappers
- **GoogleAdsMapper** - Maps Google Ads API DTO to Ad entity
- **AdsComMapper** - Maps Ads.com API DTO to Revenue entity

#### Configuration
- **GoogleAdsConfig** - Environment variable management
  - Validates required config
  - Singleton pattern

#### Dependency Injection
- **Container** - Simple DI container
  - Creates and manages instances
  - Provides singletons

**Rules:**
- ✅ Implements domain interfaces
- ✅ Can import from domain
- ✅ Handles external APIs
- ✅ Maps DTOs to entities

---

### 3. Shared Layer (`src/shared/`)

**Purpose:** Common utilities and constants used across layers.

**Components:**

#### Constants
- **googleAds.ts** - TARGET_ACCOUNTS, RETRY_CONFIG, CACHE_TTL

#### Errors
- **AppError** - Base error class
- **ValidationError** - 400 errors
- **NotFoundError** - 404 errors
- **RateLimitError** - 429 errors
- **ExternalServiceError** - 502 errors
- **ErrorHandler** - Converts errors to API responses

**Rules:**
- ✅ No business logic
- ✅ No external dependencies
- ✅ Shared across all layers

---

## 🔄 Data Flow

### Request Flow Example: Get Dashboard Data

```
1. User Request
   ↓
2. API Route (app/api/google-ads-production/route.ts)
   ↓
3. bulletproofAPI.getData() [Current]
   ↓
4. GoogleAdsMapper.toDomainList() [NEW]
   ↓
5. Domain Entities (Ad, Revenue)
   ↓
6. DataMatcher.matchAdsWithRevenue()
   ↓
7. DashboardMetrics (with ROI, profit)
   ↓
8. Response to Client
```

### Future Flow (with Use Cases)

```
1. User Request
   ↓
2. API Route (thin controller)
   ↓
3. GetDashboardDataUseCase.execute()
   ↓
4. IAdRepository.findByDateRange()
   ↓
5. GoogleAdsRepository (infrastructure)
   ↓
6. GoogleAdsClient.queryAds()
   ↓
7. GoogleAdsMapper.toDomain()
   ↓
8. Domain Entities
   ↓
9. DataMatcher + MetricsCalculator
   ↓
10. Response DTO
   ↓
11. Response to Client
```

---

## 🗺️ Architecture Mapping

### Current → New Architecture

| Current Location | New Location | Status |
|-----------------|--------------|--------|
| `lib/google-ads-api.ts` | `src/infrastructure/clients/GoogleAdsClient.ts` | ✅ Created |
| `lib/unified-cache-manager.ts` | `src/infrastructure/cache/CacheProvider.ts` | ✅ Bridged |
| Business logic in components | `src/domain/services/` | ✅ Extracted |
| API route logic | `src/domain/entities/` | ✅ Moved |
| No mappers | `src/infrastructure/mappers/` | ✅ Created |

---

## 📐 Design Patterns

### Repository Pattern
```typescript
// Interface in domain
interface IAdRepository {
  findByDateRange(dateRange: DateRange): Promise<Ad[]>;
}

// Implementation in infrastructure
class GoogleAdsRepository implements IAdRepository {
  async findByDateRange(dateRange: DateRange): Promise<Ad[]> {
    // Implementation
  }
}
```

### Mapper Pattern
```typescript
// Maps external API format to domain entity
class GoogleAdsMapper {
  static toDomain(dto: GoogleAdsApiAd): Ad {
    return new Ad(/* map fields */);
  }
}
```

### Dependency Injection
```typescript
// Simple container
class Container {
  getGoogleAdsClient(): GoogleAdsClient {
    // Returns singleton instance
  }
}
```

---

## 🎯 Key Benefits

### 1. Testability
```typescript
// Domain entities are pure - easy to test
const ad = new Ad(/*...*/);
expect(ad.slug).toBe('article-slug');
expect(ad.isActive).toBe(true);
```

### 2. Maintainability
- Business logic in one place (domain)
- Small files (<250 lines)
- Clear responsibilities

### 3. Flexibility
- Can swap Google Ads for another provider
- Can change cache implementation
- Framework independent

### 4. Scalability
- Add features without touching existing code
- Clear extension points
- Modular architecture

---

## 📊 Metrics & Improvements

### Before Clean Architecture
- ❌ Largest file: 1,369 lines
- ❌ 5 cache implementations
- ❌ 3 API route variants
- ❌ Business logic scattered
- ❌ 0% test coverage
- ❌ Hard to extend

### After Clean Architecture
- ✅ Max file size: ~250 lines
- ✅ 1 unified cache
- ✅ 1 production API route
- ✅ Business logic centralized
- ✅ Ready for 80%+ tests
- ✅ Easy to extend

---

## 🔮 Future Enhancements

### Phase 1: Complete Infrastructure ✅
- [x] CacheProvider
- [x] GoogleAdsClient
- [x] AdsComClient
- [x] DI Container

### Phase 2: Application Layer 📝
- [ ] GetDashboardDataUseCase
- [ ] GetAccountsUseCase
- [ ] RefreshDataUseCase

### Phase 3: Complete Repositories 📝
- [ ] GoogleAdsRepository
- [ ] AdsComRepository

### Phase 4: New API Routes 📝
- [ ] `/api/v2/dashboard`
- [ ] `/api/v2/accounts`
- [ ] `/api/v2/reports`

---

## 🔍 Architecture Decisions

### Why Clean Architecture?
- **Testability** - Pure domain logic
- **Maintainability** - Clear separation
- **Flexibility** - Easy to change implementations
- **Scalability** - Easy to extend

### Why Not MVC?
- MVC couples UI to business logic
- Clean Architecture separates concerns better
- More suitable for complex business logic

### Why Repository Pattern?
- Abstracts data access
- Easy to mock for testing
- Can swap implementations

### Why Mappers?
- Separates API format from domain
- API changes don't affect business logic
- Clear transformation layer

---

## 📚 Related Documentation

- **PROJECT_GUIDE.md** - Quick start and examples
- **API_REFERENCE.md** - API endpoint documentation
- **onboarding.md** - Setup instructions

