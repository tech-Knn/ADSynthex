# Google Ads API Troubleshooting Guide

## Problem Summary

You were experiencing cost data fetching failures every 2-3 days, with the system falling back to mock data. This was happening because:

1. **No rate limiting**: Making 45 API calls per dashboard load (9 accounts × 5 queries each)
2. **No retry logic**: Immediate fallback to mock data on any error
3. **No quota monitoring**: No visibility into API usage or remaining quota
4. **No error classification**: Treating all errors the same way

## Implemented Solutions

### 1. Rate Limiting & Request Management

**Location**: `lib/google-ads-api.ts`

- **Daily quota limit**: 8,000 requests/day (leaving buffer for other operations)
- **Request spacing**: 200ms between requests, 1 second between accounts
- **Proactive quota checking**: Prevents API calls when quota is exhausted

```typescript
const RATE_LIMIT_CONFIG = {
  maxRequestsPerMinute: 60,
  maxRequestsPerDay: 8000,
  delayBetweenAccounts: 1000,
  delayBetweenRequests: 200,
  maxRetries: 3,
  backoffMultiplier: 2,
  maxBackoffDelay: 10000
};
```

### 2. Comprehensive Retry Logic

**Features**:
- **Exponential backoff**: 1s, 2s, 4s delays between retries
- **Error classification**: Different handling for rate limits vs authentication vs server errors
- **Smart retry decisions**: Only retry on transient errors (429, 5xx, network issues)

**Error Types Handled**:
- `RATE_LIMIT` (429): Retry with backoff
- `QUOTA_EXCEEDED`: Don't retry, use mock data
- `AUTHENTICATION` (401/403): Don't retry, check credentials
- `SERVER_ERROR` (5xx): Retry with backoff
- `NETWORK_ERROR`: Retry with backoff

### 3. Quota Monitoring Dashboard

**New Components**:
- `QuotaStatus.tsx`: Real-time quota display
- `/api/google-ads/quota`: Quota status API endpoint
- Visual progress bars and warnings

**Features**:
- Real-time quota usage display
- Warning alerts at 75%, 90%, 95% usage
- Recommendations for quota management
- Reset time tracking

### 4. Enhanced Error Reporting

**API Response Enhancements**:
```typescript
{
  // ... data ...
  _quotaStatus: { /* quota info */ },
  _message: 'Real data fetched successfully' | 'API error occurred. Using mock data as fallback.',
  _apiError?: boolean,
  _quotaExceeded?: boolean
}
```

## Monitoring & Troubleshooting

### 1. Check Quota Status

**Dashboard**: Look for the "Google Ads API Quota Status" card at the top of the dashboard.

**API Endpoint**: `GET /api/google-ads/quota`

**Response**:
```json
{
  "quota": {
    "dailyRequestCount": 1250,
    "maxRequestsPerDay": 8000,
    "remainingRequests": 6750,
    "usagePercentage": 16,
    "resetTime": "2024-01-15T00:00:00.000Z"
  },
  "recommendations": [
    {
      "type": "info",
      "message": "API usage is normal",
      "action": "Continue monitoring"
    }
  ]
}
```

### 2. Common Error Scenarios

#### Scenario 1: "Daily API quota exceeded"
**Cause**: Hit the 8,000 requests/day limit
**Solution**: 
- Wait until quota resets (next day)
- Implement caching for frequently accessed data
- Consider upgrading Google Ads API quota

#### Scenario 2: "API rate limit exceeded"
**Cause**: Too many requests in a short time
**Solution**: 
- System automatically retries with backoff
- Reduce dashboard refresh frequency
- Check if multiple users are accessing simultaneously

#### Scenario 3: "Authentication failed"
**Cause**: Expired or invalid credentials
**Solution**:
- Check environment variables
- Refresh OAuth tokens
- Verify MCC account permissions

### 3. Log Analysis

**Key Log Messages to Monitor**:

```bash
# Normal operation
"Starting Google Ads API fetch for 9 accounts"
"Processing account 1/9: 3146253756 (Ads.com - RSOC - UTC - 04)"
"Making Active Campaigns call for account 3146253756"

# Rate limiting
"Rate limiting: waiting 200ms before next request"
"Google Ads API attempt 1 failed: RATE_LIMIT - API rate limit exceeded"

# Quota issues
"Daily rate limit exceeded for Google Ads API"
"Google Ads API daily quota exceeded, using mock data"

# Success
"Google Ads API fetch completed. Total: 45 campaigns, 553 ads"
"Daily request count: 450/8000"
```

### 4. Environment Variables Check

Ensure these are properly set:
```bash
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
GOOGLE_ADS_MANAGER_ID=your_manager_id
```

## Performance Optimization

### 1. Request Optimization

**Current**: 45 requests per dashboard load
- 9 accounts × 5 queries each
- Active campaigns, all campaigns, active ads, all ads, asset groups

**Potential Optimizations**:
- Cache campaign data for 1 hour
- Cache ad data for 30 minutes
- Implement partial loading (load most important data first)
- Batch similar queries

### 2. Caching Strategy

**Recommended Implementation**:
```typescript
// Cache campaign data for 1 hour
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

// Check cache before making API calls
const cachedData = await getCachedData(cacheKey);
if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
  return cachedData.data;
}
```

### 3. Quota Management

**Daily Usage Patterns**:
- **Conservative**: 2,000-3,000 requests/day
- **Normal**: 4,000-6,000 requests/day  
- **High**: 6,000-8,000 requests/day
- **Critical**: >8,000 requests/day (will use mock data)

**Recommendations**:
- Monitor usage patterns
- Implement user-specific caching
- Consider time-based data loading
- Set up alerts at 80% quota usage

## Troubleshooting Checklist

### When API Fails:

1. **Check quota status** in dashboard
2. **Review logs** for specific error messages
3. **Verify environment variables** are set correctly
4. **Check Google Ads API status** (external service)
5. **Verify MCC account permissions**
6. **Test with single account** to isolate issues

### When Using Mock Data:

1. **Check if quota exceeded** (most common cause)
2. **Review recent API errors** in logs
3. **Verify authentication** is working
4. **Check network connectivity**
5. **Monitor for rate limiting**

### Performance Issues:

1. **Check request frequency** in logs
2. **Monitor quota usage** over time
3. **Review caching effectiveness**
4. **Consider implementing** request batching
5. **Optimize query parameters**

## Next Steps

### Immediate Actions:
1. **Monitor the new quota dashboard** for the next few days
2. **Review logs** to understand current usage patterns
3. **Set up alerts** for high quota usage

### Medium-term Improvements:
1. **Implement caching** for campaign and ad data
2. **Add user-specific** data loading preferences
3. **Optimize queries** to reduce request count
4. **Consider upgrading** Google Ads API quota if needed

### Long-term Strategy:
1. **Implement intelligent caching** based on data freshness requirements
2. **Add predictive loading** for frequently accessed data
3. **Consider alternative data sources** for backup
4. **Implement A/B testing** for different loading strategies

## Support Contacts

- **Google Ads API Support**: For quota increases and technical issues
- **Google Cloud Console**: For authentication and project setup
- **Internal Team**: For application-specific issues

---

**Last Updated**: January 2024
**Version**: 1.0 