# Compado Integration Documentation

## Overview

This document describes the Compado conversion tracking integration witg AdSyntheX. The integration follows a clean MVC architecture with proper separation of concerns.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend Layer                       │
│  - ConversionStats.tsx (Statistics Display)                 │
│  - CampaignPerformance.tsx (Campaign Table)                 │
│  - /app/compado/page.tsx (Main Page)                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        API Route Layer                       │
│  - /app/api/compado/route.ts                                │
│    • POST /api/compado (with action parameter)              │
│    • GET /api/compado (query parameters)                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       Service Layer                          │
│  - CompadoConversionService                                 │
│    • Business logic for conversions                         │
│    • Data aggregation & filtering                           │
│    • Campaign performance analytics                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    API Client Layer                          │
│  - lib/compado-api.ts                                       │
│    • HTTP client for Compado API                            │
│    • Request/response transformation                        │
│    • Pagination handling                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Domain Entities                         │
│  - Conversion.ts (Entity model)                             │
│  - ConversionAggregate.ts (Aggregation logic)               │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
AdSyntheX/
├── .env.local                                    # Environment configuration
├── lib/
│   ├── compado-api.ts                           # Compado API client
│   └── error-handler.ts                         # Error handling utilities
├── src/
│   └── domain/
│       ├── entities/
│       │   └── Conversion.ts                    # Conversion entity
│       └── services/
│           └── CompadoConversionService.ts      # Business logic service
├── app/
│   ├── api/
│   │   └── compado/
│   │       └── route.ts                         # API endpoint
│   └── compado/
│       └── page.tsx                             # Frontend page
└── components/
    └── Compado/
        ├── ConversionStats.tsx                  # Stats dashboard
        └── CampaignPerformance.tsx              # Campaign table
```

## Environment Configuration

Add these variables to  `.env.local` (not tracked by Git):

```env
# Compado API Configuration
COMPADO_API_USER=your_username_here
COMPADO_API_PASSWORD=your_password_here
COMPADO_API_URL=https://api.compado.com
COMPADO_PUBLISHER_ID=publisher_id
COMPADO_DOMAIN=domain.com
```

## API Endpoints

### Compado API Endpoint

**URL:** `https://api.compado.com/adsense/clickid-report`

**Method:** GET

**Parameters:**
- `user` - Username (*********)
- `password` - Password (######)
- `start_date` - Start date (YYYY-MM-DD)
- `end_date` - End date (YYYY-MM-DD)
- `page` - Page number (default: 1)

### Internal API Endpoints

#### 1. Get Conversion Statistics
```bash
POST /api/compado
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-08",
  "action": "stats"
}
```

**Response:**
```json
{
  "total_conversions": 150,
  "total_revenue": 67.50,
  "average_revenue_per_conversion": 0.45,
  "unique_campaigns": 12,
  "date_range": {
    "start_date": "2025-10-01",
    "end_date": "2025-10-08"
  }
}
```

#### 2. Get Campaign Performance
```bash
POST /api/compado
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-08",
  "action": "campaigns"
}
```

**Response:**
```json
[
  {
    "campaign_id": "123456",
    "conversions": 45,
    "revenue": 20.25,
    "average_revenue": 0.45
  }
]
```

#### 3. Get Daily Breakdown
```bash
POST /api/compado
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-08",
  "action": "daily"
}
```

#### 4. Get All Conversions
```bash
POST /api/compado
Content-Type: application/json

{
  "startDate": "2025-10-01",
  "endDate": "2025-10-08"
}
```

## Usage Examples

### Frontend Component Usage

```tsx
import ConversionStats from '@/components/Compado/ConversionStats';
import CampaignPerformance from '@/components/Compado/CampaignPerformance';

export default function MyPage() {
  return (
    <div>
      <ConversionStats />
      <CampaignPerformance
        startDate="2025-10-01"
        endDate="2025-10-08"
      />
    </div>
  );
}
```

### Service Layer Usage

```typescript
import { CompadoConversionService } from '@/src/domain/services/CompadoConversionService';

const service = new CompadoConversionService();

// Get conversion statistics
const stats = await service.getConversionStats('2025-10-01', '2025-10-08');

// Get campaign performance
const campaigns = await service.getCampaignPerformance('2025-10-01', '2025-10-08');

// Get conversions by campaign
const conversions = await service.getConversionsByCampaign('123456', '2025-10-01', '2025-10-08');
```

### API Client Usage

```typescript
import { fetchCompadoConversions, fetchAllCompadoConversions } from '@/lib/compado-api';

// Fetch single page
const response = await fetchCompadoConversions({
  start_date: '2025-10-01',
  end_date: '2025-10-08',
  page: 1
});

// Fetch all pages
const allConversions = await fetchAllCompadoConversions('2025-10-01', '2025-10-08');
```

## Features

### 1. Conversion Tracking
- Real-time conversion data from Compado API
- Date range filtering
- Automatic pagination handling

### 2. Campaign Analytics
- Campaign-level performance metrics
- Revenue aggregation by campaign
- Conversion rate tracking

### 3. Data Visualization
- Summary cards with key metrics
- Campaign performance table
- Sortable and filterable data

### 4. Error Handling
- Comprehensive error handling with custom error types
- Retry logic with exponential backoff
- User-friendly error messages

### 5. Caching
-Redish Upstash
## Testing

### Test API Connection

```bash
```

### Test Internal API

```bash
# Test stats endpoint
curl -X POST http://localhost:3000/api/compado \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-10-01","endDate":"2025-10-08","action":"stats"}'

# Test campaigns endpoint
curl -X POST http://localhost:3000/api/compado \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-10-01","endDate":"2025-10-08","action":"campaigns"}'
```

## Performance Considerations

1. **Pagination:** The integration handles pagination automatically to fetch all conversion data.

2. **Caching:** API responses are cached for 5 minutes to reduce load.

3. **Rate Limiting:** Built-in retry logic with exponential backoff.

4. **Error Handling:** Comprehensive error handling prevents application crashes.

## Security

1. **Environment Variables:** All credentials stored in `.env.local`
2. **Server-Side API Calls:** API credentials never exposed to client
3. **Input Validation:** Date validation and sanitization

## Future Enhancements

1. **Real-time Updates:** WebSocket integration for live conversion tracking
2. **Advanced Filtering:** Filter by device, country, conversion type
3. **Export Functionality:** Export conversion data to CSV/Excel
4. **Custom Reports:** Build custom reports with date comparisons
5. **Alerts:** Set up alerts for conversion thresholds

## Troubleshooting

### API Connection Issues

1. **Verify credentials:**
   ```bash
   echo $COMPADO_API_USER
   echo $COMPADO_API_PASSWORD
   ```

2. **Test API endpoint directly:**
   ```bash
   curl "https://api.compado.com/adsense/clickid-report?user=************&password=#############&start_date=2025-10-07&end_date=2025-10-07&page=1"
   ```

3. **Check server logs:**
   ```bash
   # Development
   npm run dev

   # Check console for API errors
   ```

### Common Errors

| Error | Solution |
|-------|----------|
| `Invalid date format` | Ensure dates are in YYYY-MM-DD format |
| `API request failed` | Check API credentials in .env.local |
| `Rate limit exceeded` | Wait and retry, or reduce request frequency |

## Support

For issues or questions:
1. Check the error logs in the browser console
2. Review the server logs
3. Verify API credentials
4. Contact Compado support for API issues

## License

This integration is part of the AdSyntheX project.
