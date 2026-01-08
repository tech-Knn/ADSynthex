# PRD: Compado & Ads.com Performance Optimization

**Document Version:** 1.0
**Date:** 2025-01-17
**Status:** Ready for Implementation
**Priority:** P0 - Critical
**Estimated Implementation Time:** 2-3 hours

---

## 1. EXECUTIVE SUMMARY

### Problem Statement
Compado and Ads.com feeds are experiencing severe performance issues with 3-5 minute load times and data accuracy problems, risking project abandonment. AFS feed works perfectly with sub-second load times.

### Current State
- **Compado "All Accounts"**: 3-5 minute load time (20 accounts)
- **Ads.com**: 3-5 minute load time
- **AFS**: < 1 second (✅ Working perfectly)
- **User Impact**: Severe frustration, wrong data 90% of the time
- **Root Cause**: Inefficient API query pattern + cache not working

### Goal
Reduce Compado/Ads.com load times from **3-5 minutes to < 1 minute** (first load) and **< 1 second** (cached loads) while maintaining Google Ads API rate limit compliance.

---

## 2. ROOT CAUSE ANALYSIS

### 🔴 Critical Issues Identified

#### Issue #1: Day-by-Day GCLID Fetching (BIGGEST ISSUE)
**Location:** `lib/google-ads-api.ts` lines 743-765

**Current Behavior:**
- Fetches click_view (GCLID) data ONE DAY AT A TIME in a loop
- 7-day range = 7 separate API queries per account
- 30-day range = 30 separate API queries per account
- 20 Compado accounts × 7 days = **140 API calls**

**Impact:**
- **Time**: 140 API calls × 1 second = 140 seconds (2.3 minutes)
- **Rate Limits**: Consumes 7-30x more quota than necessary
- **Delays**: 200ms delay between each day = additional 28 seconds

**Evidence:**
```typescript
// Current inefficient code:
for (let dayOffset = 0; dayOffset <= daysDiff; dayOffset++) {
  const dateString = currentDate.toISOString().split('T')[0];
  const clickViewQuery = buildClickViewQuery(dateString, dateString); // ONE DAY!
  const clickViewResponse = await makeApiCall(clickViewQuery, ...);
  await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
}
```

---

#### Issue #2: Hardcoded 1-Second Account Delays
**Location:** `lib/google-ads-api.ts` lines 776-778

**Current Behavior:**
- Adds 1000ms delay after processing each account
- 20 accounts × 1 second = 20 seconds wasted

**Impact:**
- **Time**: 20 seconds of pure waiting
- **Redundancy**: Rate limiter already enforces 500ms minimum (2 QPS)

---

#### Issue #3: Redis Cache Not Working
**Location:** `lib/redis-cache-manager.ts` lines 166-170

**Current Behavior:**
- Skips Redis storage if data > 8MB
- "All Accounts" response with 20 accounts × thousands of GCLIDs = 10-20MB
- Data never cached → every load hits API

**Impact:**
- **Time**: No caching benefit, every load takes 3-5 minutes
- **Rate Limits**: Unnecessary API calls on repeat loads

**Evidence:**
```typescript
if (dataSizeMB > 8) {
  console.warn(`Data size ${dataSizeMB.toFixed(2)}MB exceeds 8MB limit, skipping Redis cache`);
  return; // NOT CACHED!
}
```

---

#### Issue #4: Small Batch Size
**Location:** `app/api/compado-cost-revenue/route.ts` line 217

**Current Behavior:**
- Batch size = 3 accounts
- 20 accounts / 3 = 7 sequential batches
- Each batch takes ~35 seconds

**Impact:**
- **Time**: 7 batches × 35s = 4 minutes total

---

### 📊 Load Time Breakdown (7-Day Range, "All Accounts")

| Component | Time | Calculation |
|-----------|------|-------------|
| Day-by-day GCLID queries | 140s | 20 accounts × 7 days × 1s |
| 200ms delays between days | 28s | 20 accounts × 7 × 200ms |
| 1s delays between accounts | 20s | 20 accounts × 1s |
| Campaign + Ad queries | 40s | 20 accounts × 2 queries |
| Batch processing overhead | 30s | Sequential batch waiting |
| **TOTAL** | **258s** | **= 4.3 minutes** ✅ |

This precisely matches the reported 3-5 minute load time.

---

## 3. PROPOSED SOLUTION

### Solution Overview
Implement 4 targeted fixes that are **rate-limit safe** and reduce API calls by **85%** while enabling effective caching.

### 🎯 Impact by Feed

| Fix | Compado | Ads.com | Shared Code |
|-----|---------|---------|-------------|
| #1: Date Range GCLIDs | ✅ Auto | ✅ Auto | `lib/google-ads-api.ts` |
| #2: Remove Delays | ✅ Auto | ✅ Auto | `lib/google-ads-api.ts` |
| #3: Aggregated Caching | ✅ Yes | ✅ Yes | Separate routes |
| #4: Batch Size | ✅ Yes | ❌ N/A | Compado only |

**Key Point:** Fixes #1 and #2 benefit **BOTH** Compado and Ads.com automatically because they share the same underlying `fetchGoogleAdsData()` function.

---

### 🟢 FIX #1: Fetch GCLIDs for Entire Date Range (Priority: P0)

**Change:** Replace day-by-day loop with single query for entire date range

**File:** `lib/google-ads-api.ts` lines 743-765

**Current Code:**
```typescript
for (let dayOffset = 0; dayOffset <= daysDiff; dayOffset++) {
  const currentDate = new Date(start);
  currentDate.setDate(start.getDate() + dayOffset);
  const dateString = currentDate.toISOString().split('T')[0];

  const clickViewQuery = buildClickViewQuery(dateString, dateString);
  const clickViewResponse = await makeApiCall(clickViewQuery, `Click Views (GCLIDs)`);

  if (clickViewResponse && clickViewResponse.length > 0) {
    const clicks = processClickData(clickViewResponse, account);
    if (clicks.length > 0) {
      data.clicks!.push(...clicks);
    }
  }

  if (dayOffset < daysDiff) {
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
```

**New Code:**
```typescript
// Fetch entire date range in ONE query
const clickViewQuery = buildClickViewQuery(startDate, endDate);
console.log(`[GOOGLE_ADS_API] Fetching click_view data (GCLIDs) for ${account.name}: ${startDate} to ${endDate}`);

const clickViewResponse = await makeApiCall(
  clickViewQuery,
  `Click Views (GCLIDs) for ${account.name}`
);

if (clickViewResponse && clickViewResponse.length > 0) {
  const clicks = processClickData(clickViewResponse, account);
  if (clicks.length > 0) {
    data.clicks!.push(...clicks);
    console.log(`[GOOGLE_ADS_API] Fetched ${clicks.length} clicks for ${account.name}`);
  }
}
```

**Impact:**
- **API Calls**: 140 → 20 (7-day) or 600 → 20 (30-day) = **85-97% reduction** ✅
- **Time Saved**: ~2 minutes
- **Rate Limit**: SAFER (fewer total calls)

**Testing:**
- Verify click_view query supports date ranges (it does - Google Ads API standard)
- Test with 7-day, 14-day, 30-day ranges
- Confirm same number of GCLIDs returned

---

### 🟢 FIX #2: Remove Hardcoded Account Delays (Priority: P0)

**Change:** Remove 1000ms delay, rely on rate limiter

**File:** `lib/google-ads-api.ts` lines 776-778

**Current Code:**
```typescript
// Add delay between accounts to prevent overwhelming the API
if (i < accountsToProcess.length - 1) {
  console.log(`Waiting 1000ms before next account...`);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

**New Code:**
```typescript
// REMOVED - Rate limiter at line 596 already enforces 500ms minimum (2 QPS)
// and will auto-throttle if quota limits approached
```

**Rationale:**
- Rate limiter already enforces minimum 500ms between requests (2 QPS)
- Rate limiter has quota monitoring, cooldown, circuit breaker
- Hardcoded delay is redundant and wasteful

**Impact:**
- **Time Saved**: 20 seconds
- **Rate Limit**: Still protected by rate limiter

**Testing:**
- Monitor rate limiter logs during multi-account fetch
- Verify no rate limit errors
- Confirm auto-throttling works

---

### 🟢 FIX #3: Cache Aggregated Results Only (Priority: P0)

**Change:** Cache final aggregated data (small) instead of raw clicks (huge)

**File:** `app/api/compado-cost-revenue/route.ts`

**Implementation:**

**Step 3.1 - Add cache check at start** (after line 134):
```typescript
// Check for cached aggregated results FIRST
const aggregatedCacheKey = `compado-agg:${isAllAccounts ? 'all' : customerId}:${startDate}:${endDate}`;
const cachedAggregated = await redisCacheManager.get(aggregatedCacheKey, { dataType: 'compado' });

if (cachedAggregated.data && !forceRefresh) {
  console.log(`[COMPADO_COST_REVENUE] ✅ Serving cached aggregated data (${Math.round(cachedAggregated.age / 1000)}s old)`);
  return NextResponse.json({
    campaign_aggregated: cachedAggregated.data.campaign_aggregated,
    summary: cachedAggregated.data.summary,
    _source: 'redis-aggregated-cache',
    _timestamp: new Date().toISOString(),
    _message: `Cached data (${Math.round(cachedAggregated.age / 1000)}s old)`,
    _dataFreshness: {
      source: 'redis',
      ageMinutes: Math.round(cachedAggregated.age / 60000),
      isFresh: true,
      message: `Aggregated cache (${Math.round(cachedAggregated.age / 60000)} min old)`
    }
  });
}
```

**Step 3.2 - Cache after aggregation** (after line 523):
```typescript
// Cache the aggregated results (small data)
console.log('[COMPADO_COST_REVENUE] Caching aggregated results...');
await redisCacheManager.set(aggregatedCacheKey, {
  campaign_aggregated: campaignAggregated,
  summary: summary
}, {
  dataType: 'compado',
  ttl: 3600 // 1 hour
});

const cacheSize = JSON.stringify({ campaign_aggregated: campaignAggregated, summary }).length / 1024;
console.log(`[COMPADO_COST_REVENUE] ✓ Cached aggregated results: ${cacheSize.toFixed(2)}KB (< 8MB, fits in Redis)`);
```

**Impact:**
- **Cache Size**: ~50-200KB (aggregated) vs 10-20MB (raw)
- **Cache Hit**: Second load < 1 second
- **Rate Limit**: Prevents repeat API calls

**Testing:**
- Verify cache key uniqueness
- Test cache expiration (TTL)
- Confirm data consistency

---

### 🟢 FIX #4: Increase Batch Size (Priority: P1)

**Change:** Increase batch size from 3 to 5 accounts

**File:** `app/api/compado-cost-revenue/route.ts` line 217

**Current Code:**
```typescript
const BATCH_SIZE = 3;
```

**New Code:**
```typescript
const BATCH_SIZE = 5; // Increased from 3, still conservative for rate limits
```

**Impact:**
- **Batches**: 7 → 4 (for 20 accounts)
- **Time Saved**: ~1 minute
- **Rate Limit**: Still safe (rate limiter protects each request)

**Testing:**
- Monitor rate limiter during batch processing
- Verify no quota exhaustion

---

## 4. IMPLEMENTATION PLAN

### Phase 1: Core API Optimization (60 minutes)
**Priority:** P0 - Critical
**Files:** `lib/google-ads-api.ts`

1. **Implement Fix #1** (30 min)
   - Replace day-by-day loop with single date range query
   - Remove 200ms delays
   - Test with 7-day, 14-day, 30-day ranges

2. **Implement Fix #2** (10 min)
   - Remove hardcoded 1000ms account delays
   - Verify rate limiter protection

3. **Testing** (20 min)
   - Test single account
   - Test multi-account (5 accounts)
   - Monitor rate limiter logs

### Phase 2: Caching Strategy (45 minutes)
**Priority:** P0 - Critical
**Files:** `app/api/compado-cost-revenue/route.ts`

1. **Implement Fix #3** (30 min)
   - Add aggregated cache check at start
   - Cache aggregated results after processing
   - Test cache hit/miss scenarios

2. **Testing** (15 min)
   - First load (no cache)
   - Second load (with cache)
   - ForceRefresh behavior

### Phase 3: Batch Optimization (15 minutes)
**Priority:** P1 - High
**Files:** `app/api/compado-cost-revenue/route.ts`

1. **Implement Fix #4** (5 min)
   - Change BATCH_SIZE from 3 to 5

2. **Testing** (10 min)
   - Test "All Accounts" load
   - Monitor rate limiter

### Phase 4: Apply Caching to Ads.com (30 minutes)
**Priority:** P1 - High
**Files:** `app/api/google-ads-production/route.ts`

**NOTE:** Fixes #1 and #2 (GCLID fetching + delays) automatically apply to Ads.com since both feeds share `lib/google-ads-api.ts`. This phase only adds caching.

1. **Add Aggregated Cache Check** (15 min)
   - Check cache before calling bulletproofAPI.getData()
   - Cache key: `adscom-agg:{customerId}:{startDate}:{endDate}`
   - Return cached data if fresh

2. **Cache Aggregated Results** (10 min)
   - After transforming API response
   - Cache only `ads[]` array and summary stats
   - TTL: 3600 seconds (1 hour)

3. **Testing** (5 min)
   - Test Ads.com first load
   - Test cached load
   - Verify data accuracy

---

## 5. SUCCESS METRICS

### Performance Targets

#### Compado (All Accounts - 20 accounts)

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| First Load Time (7-day) | 4-5 minutes | < 1 minute | Browser DevTools Network tab |
| Cached Load Time | 4-5 minutes | < 1 second | Subsequent loads without forceRefresh |
| API Calls (7-day) | 140 calls | 20 calls | Rate limiter logs |
| API Calls (30-day) | 600 calls | 20 calls | Rate limiter logs |
| Redis Cache Hit Rate | 0% | > 80% | Redis cache manager stats |
| Cache Size | > 8MB (fails) | < 1MB | Redis cache logs |

#### Ads.com (Single Account or Multi-Account)

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| First Load Time (7-day) | 3-4 minutes | < 30 seconds | Browser DevTools Network tab |
| Cached Load Time | 3-4 minutes | < 1 second | Subsequent loads |
| API Calls (7-day) | 7 calls | 1 call | Rate limiter logs |
| Redis Cache Hit Rate | 0% | > 80% | Redis cache manager stats |

**Note:** Ads.com benefits from same GCLID optimizations but typically queries fewer accounts than Compado.

### Validation Criteria

#### ✅ Must Pass:
1. First load completes in < 60 seconds (7-day range, all accounts)
2. Second load completes in < 2 seconds
3. No rate limit errors in logs
4. Cache successfully stores and retrieves data
5. Data accuracy maintained (same GCLIDs returned)
6. All campaigns showing correct cost/revenue

#### ✅ Should Pass:
1. 30-day range loads in < 90 seconds (first load)
2. Single account loads in < 10 seconds
3. Cache hit rate > 80% after first load
4. Rate limiter shows < 100 requests for "All Accounts" load

---

## 6. RISK ASSESSMENT

### High Risk Items

#### Risk #1: Google Ads Rate Limit Violation
**Probability:** Low
**Impact:** Critical
**Mitigation:**
- Existing rate limiter remains active (2 QPS, daily/hourly limits)
- Fewer total API calls than current implementation (140 → 20)
- Rate limiter has circuit breaker + cooldown protection
- Test incrementally (1 account → 5 accounts → all accounts)

#### Risk #2: Different GCLID Count with Range Query
**Probability:** Very Low
**Impact:** Medium
**Mitigation:**
- Google Ads API officially supports date ranges in click_view
- Test with known date range and compare counts
- Rollback plan: revert to day-by-day if counts mismatch

#### Risk #3: Cache Invalidation Issues
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Use unique cache keys with date range
- TTL = 1 hour (auto-expires)
- ForceRefresh clears cache
- Monitor cache key patterns

### Medium Risk Items

#### Risk #4: Batch Size Too Large
**Probability:** Low
**Impact:** Low
**Mitigation:**
- Only increasing from 3 to 5 (conservative)
- Rate limiter protects each request
- Monitor quota usage

---

## 7. ROLLBACK PLAN

### If Issues Occur:

**Immediate Rollback:**
```bash
# Revert changes
git revert <commit-hash>
git push origin main
```

**Gradual Rollback:**
1. Reduce batch size back to 3
2. Re-enable 1000ms delays
3. Revert to day-by-day GCLID fetching (last resort)

**Monitoring:**
- Watch rate limiter logs for quota exhaustion
- Monitor error rates in application logs
- Check user reports for data accuracy

---

## 8. TESTING CHECKLIST

### Pre-Deployment Testing

- [ ] **Unit Tests**
  - [ ] buildClickViewQuery accepts date ranges
  - [ ] Cache key generation includes date range
  - [ ] Aggregated data serialization < 1MB

- [ ] **Integration Tests**
  - [ ] Single account load (Compado)
  - [ ] 5 accounts load (Compado)
  - [ ] All accounts load (Compado)
  - [ ] Ads.com single account
  - [ ] Cache hit/miss scenarios

- [ ] **Performance Tests**
  - [ ] Measure first load time
  - [ ] Measure cached load time
  - [ ] Count API calls (rate limiter logs)
  - [ ] Verify cache size

- [ ] **Rate Limit Tests**
  - [ ] No rate limit errors in logs
  - [ ] Quota usage < 80%
  - [ ] Auto-throttling works

### Post-Deployment Monitoring (24 hours)

- [ ] Monitor application error logs
- [ ] Check rate limiter quota usage
- [ ] Collect user feedback on load times
- [ ] Verify data accuracy (compare with previous data)
- [ ] Monitor Redis cache hit rates

---

## 9. DEPENDENCIES

### Required:
- Redis (Upstash) - Already configured ✅
- Rate limiter - Already implemented ✅
- Google Ads API access - Already working ✅

### Optional:
- None

---

## 10. DOCUMENTATION UPDATES

### Files to Update:
1. `README.md` - Update performance benchmarks
2. `lib/google-ads-api.ts` - Add comments explaining date range query
3. `app/api/compado-cost-revenue/route.ts` - Document caching strategy

### Developer Notes:
- Add inline comments explaining why entire date range is fetched
- Document cache key format
- Explain batch size rationale

---

## 11. ALTERNATIVE SOLUTIONS CONSIDERED

### Alternative #1: Increase Cache TTL
**Rejected Reason:** Doesn't solve the root cause (slow first load)

### Alternative #2: Pre-warm Cache
**Rejected Reason:** Still requires slow API calls, just shifts timing

### Alternative #3: Pagination
**Rejected Reason:** Adds complexity, doesn't reduce API calls significantly

### Alternative #4: MongoDB Fallback
**Rejected Reason:** MongoDB sync is unreliable (user disabled it)

---

## 12. APPENDIX

### A. Code References

**Rate Limiter:** `/lib/redis-rate-limiter.ts`
- Daily limit: 10,000 requests
- Hourly limit: 3,000 requests
- QPS: 2 (500ms minimum)

**Cache Manager:** `/lib/redis-cache-manager.ts`
- 8MB size limit for Redis
- 3-tier caching: Memory → Redis → API

**Google Ads API:** `/lib/google-ads-api.ts`
- Main data fetching logic
- Rate limiter integration at line 596

### B. API Call Breakdown (Current)

**Per Account (7-day range):**
- Campaign query: 1 call
- Ad query: 1 call
- Click queries: 7 calls (one per day)
- **Total:** 9 calls/account

**20 Accounts:**
- Total calls: 180 API calls
- Time: ~4 minutes

### C. API Call Breakdown (After Fixes)

**Per Account (7-day range):**
- Campaign query: 1 call
- Ad query: 1 call
- Click query: 1 call (entire range)
- **Total:** 3 calls/account

**20 Accounts:**
- Total calls: 60 API calls (67% reduction)
- Time: ~45 seconds (83% faster)

---

## APPROVAL & SIGN-OFF

**Prepared By:** Development Team
**Date:** 2025-01-17
**Status:** Ready for Implementation

**Reviewed By:** ________________
**Date:** ________________

**Approved By:** ________________
**Date:** ________________

---

**NEXT STEPS:**
1. Review and approve this PRD
2. Schedule implementation (estimated 2-3 hours)
3. Execute Phase 1 (Core API Optimization)
4. Test and validate
5. Execute Phase 2-4
6. Monitor for 24 hours
7. Document results

---

**END OF DOCUMENT**
