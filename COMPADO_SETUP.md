# Compado Integration - Quick Setup Guide

## ✅ What's Been Built

A complete, production-ready Compado conversion tracking integration with:

- **Clean MVC Architecture** - Proper separation of concerns
- **Type-Safe** - Full TypeScript support
- **Error Handling** - Comprehensive error handling with retry logic
- **Pagination** - Automatic handling of paginated responses
- **Caching** - 5-minute cache to optimize performance
- **Professional UI** - Clean, modern dashboard components

## 📁 Files Created

```
✅ .env.local                                   # API credentials
✅ lib/compado-api.ts                           # API client
✅ lib/error-handler.ts                         # Error handling
✅ src/domain/entities/Conversion.ts            # Domain entity
✅ src/domain/services/CompadoConversionService.ts  # Business logic
✅ app/api/compado/route.ts                     # API endpoint
✅ app/compado/page.tsx                         # Frontend page
✅ components/Compado/ConversionStats.tsx       # Stats component
✅ components/Compado/CampaignPerformance.tsx   # Campaign table
✅ COMPADO_INTEGRATION.md                       # Full documentation
✅ COMPADO_SETUP.md                             # This guide
```

## Quick Start

### 1. Environment Variables

Add these to `.env.local` file (not tracked by Git):

```env
COMPADO_API_USER=your_username_here
COMPADO_API_PASSWORD=your_password_here
COMPADO_API_URL=https://api.compado.com
COMPADO_PUBLISHER_ID=your_publisher_id
COMPADO_DOMAIN=your_domain.com
```

🔒 **Security Checklist:**
- ✅ `.env.local` is in `.gitignore`
- ✅ Never commit credentials to version control
- ✅ Use environment variables for all sensitive data
- ✅ Credentials only stored server-side

### 2. Start Development Server

```bash
npm run dev
```

### 3. Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000/compado
```

## 📊 Available Endpoints

### Frontend Pages
- **`/compado`** - Main conversion tracking dashboard

### API Routes
- **POST `/api/compado`** - Main API endpoint
  - Action: `stats` - Get conversion statistics
  - Action: `campaigns` - Get campaign performance
  - Action: `daily` - Get daily breakdown
  - Action: `country-breakdown` - Get country data
  - Action: `top-campaigns` - Get top 10 campaigns
  - Default (no action) - Get all conversions

### Example API Calls

```bash
# Get conversion statistics
curl -X POST http://localhost:3000/api/compado \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-10-01",
    "endDate": "2025-10-08",
    "action": "stats"
  }'

# Get campaign performance
curl -X POST http://localhost:3000/api/compado \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-10-01",
    "endDate": "2025-10-08",
    "action": "campaigns"
  }'
```

## Dashboard Features

### 1. Conversion Statistics
- Total conversions count
- Total revenue
- Average revenue per conversion
- Number of unique campaigns

### 2. Campaign Performance Table
- Campaign ID
- Number of conversions
- Total revenue
- Average revenue per conversion
- Performance rating (Low/Good/Excellent)
- Sortable by any column
- Pagination with customizable page size

### 3. Date Range Selector
- Select custom date ranges
- Refresh button to reload data
- Automatic data fetching

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           Frontend (React/Next.js)          │
│  • ConversionStats (metrics cards)          │
│  • CampaignPerformance (data table)         │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│          API Route (/api/compado)           │
│  • Request validation                       │
│  • Response formatting                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│    Service Layer (Business Logic)           │
│  • CompadoConversionService                 │
│  • Data aggregation                         │
│  • Campaign analytics                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│       API Client (HTTP Layer)               │
│  • Compado API integration                  │
│  • Pagination handling                      │
│  • Error handling & retry                   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Domain Entities (Models)            │
│  • Conversion                               │
│  • ConversionAggregate                      │
└─────────────────────────────────────────────┘
```

## 🧪 Testing

### Test Compado API Connection

```bash
# Direct API test (returns data from Compado)
curl "https://api.compado.com/adsense/clickid-report?user=**************&password=#############&start_date=2025-10-07&end_date=2025-10-07&page=1"
```

**Result:** `{"status":"ok","page_count":0,"page":1,"click_ids":[]}`
✅ API connection verified!

### Test Your Internal API

```bash
# Test stats endpoint
curl -X POST http://localhost:3000/api/compado \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2025-10-01","endDate":"2025-10-08","action":"stats"}'
```

## 📝 Using the Integration

### In Your Code

```typescript
// Import the service
import { CompadoConversionService } from '@/src/domain/services/CompadoConversionService';

const service = new CompadoConversionService();

// Get conversion stats
const stats = await service.getConversionStats('2025-10-01', '2025-10-08');
console.log(`Total conversions: ${stats.total_conversions}`);
console.log(`Total revenue: $${stats.total_revenue}`);

// Get campaign performance
const campaigns = await service.getCampaignPerformance('2025-10-01', '2025-10-08');
campaigns.forEach(campaign => {
  console.log(`Campaign ${campaign.campaign_id}: ${campaign.conversions} conversions, $${campaign.revenue}`);
});
```

### In Your Components

```tsx
import ConversionStats from '@/components/Compado/ConversionStats';
import CampaignPerformance from '@/components/Compado/CampaignPerformance';

export default function MyPage() {
  return (
    <>
      <ConversionStats />
      <CampaignPerformance startDate="2025-10-01" endDate="2025-10-08" />
    </>
  );
}
```

## 🔒 Security Features

- ✅ API credentials stored securely in environment variables
- ✅ Server-side API calls (credentials never exposed to client)
- ✅ Input validation for dates
- ✅ Sanitized error messages

## 🎯 Next Steps

1. **Start the dev server**: `npm run dev`
2. **Visit**: `http://localhost:3000/compado`
3. **View conversions**: See real-time conversion data
4. **Customize**: Modify components to fit your needs

## 🔧 Customization

### Change Date Range Default

Edit `/app/compado/page.tsx`:

```typescript
const [dateRange] = useState({
  startDate: dayjs().subtract(30, 'days').format('YYYY-MM-DD'), // 30 days
  endDate: dayjs().format('YYYY-MM-DD')
});
```

### Add More Metrics

Edit `/components/Compado/ConversionStats.tsx` to add new stat cards.

### Customize Table Columns

Edit `/components/Compado/CampaignPerformance.tsx` to modify the table structure.

## 📚 Additional Resources

- **Full Documentation**: See `COMPADO_INTEGRATION.md`
- **API Reference**: https://api.compado.com/docs/external-reports
- **Domain**: https://drivenbytips.com

## 🐛 Troubleshooting

### No data showing?

1. Check if conversions exist for your date range
2. Verify API credentials in `.env.local`
3. Check browser console for errors
4. Check server logs with `npm run dev`

### API errors?

1. Test Compado API directly (see Testing section above)
2. Verify credentials are correct
3. Check if Compado API is operational

### TypeScript errors?

```bash
# Clear Next.js cache and rebuild
npm run clean
npm run dev
```

## ✨ Features Highlights

- **Real-time Data**: Live conversion tracking from Compado
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Professional UI**: Clean, modern interface using Ant Design
- **Type Safety**: Full TypeScript support for better DX
- **Error Handling**: Graceful error handling with user-friendly messages
- **Performance**: Optimized with caching and pagination
- **Scalable**: Built with MVC architecture for easy extension

## 🎉 Ready to Use!

Your Compado integration is complete and ready to use. All code follows best practices:
- Clean architecture
- Type safety
- Error handling
- Professional UI
- Production-ready

Just run `npm run dev` and visit `/compado` to see it in action!
