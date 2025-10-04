# 🚀 Inuvo Cost vs Revenue Integration

This document explains how to set up and use the **Inuvo API integration** for cost vs revenue analysis using TKID mapping.

## 📋 **Overview**

The Inuvo integration provides:
- **Cost data** from Google Ads API
- **Revenue data** from Inuvo API  
- **TKID-based mapping** between cost and revenue
- **ROI analysis** and profitability insights
- **Real-time dashboard** with interactive charts

## 🔧 **Setup Instructions**

### 1. **Environment Variables**

Add your Inuvo API credentials to `.env.local`:

```bash
# Inuvo API Configuration
INUVO_ACCESS_TOKEN=your_inuvo_access_token_here

# Existing Google Ads configuration (required)
GOOGLE_ADS_CLIENT_ID=your_google_ads_client_id
GOOGLE_ADS_CLIENT_SECRET=your_google_ads_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_google_ads_refresh_token
GOOGLE_ADS_DEVELOPER_TOKEN=your_google_ads_developer_token
GOOGLE_ADS_MANAGER_ID=your_mcc_account_id
```

### 2. **Inuvo Accounts**

The integration is configured for these accounts:
- **Account 01**: `7195529443` (Inuvo - Account - 02 - GMT)
- **Account 02**: `7616718892` (Inuvo - Account 2 - PST)
- **Account 03**: `9833281050` (Inuvo - Account 3 - PST)
- **Account 04**: `9790364217` (Inuvo - Account - 03 - GMT)
- **Account 05**: `9835231086` (Inuvo - Account - 04 - GMT)
- **Account 06**: `2420687578` (Inuvo - Account - 05 - GMT)

### 3. **Getting Your Inuvo Access Token**

1. Log into your Inuvo partner dashboard
2. Navigate to **API Access** section
3. Generate or copy your **Access Token**
4. Add it to your `.env.local` file

## 🎯 **Features**

### **Cost vs Revenue Dashboard**
- **Real-time mapping** between Google Ads cost and Inuvo revenue
- **TKID-based correlation** for accurate attribution
- **ROI calculation** and profitability analysis
- **Interactive charts** and detailed tables

### **Key Metrics**
- **Total Cost**: Advertising spend from Google Ads
- **Total Revenue**: Earnings from Inuvo
- **Net Profit**: Revenue - Cost
- **Overall ROI**: (Revenue - Cost) / Cost × 100
- **Profitability Rate**: % of profitable campaigns

### **Platform Breakdown**
- **Desktop** revenue and cost analysis
- **HighEndMobile** performance metrics
- **Tablet** and other platform insights

## 🔗 **API Endpoints**

### **Main Endpoint: `/api/inuvo`**

**POST Request:**
```javascript
const response = await fetch('/api/inuvo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    customerId: null, // or specific account ID
    dataType: 'realtime', // or 'daily'
    useMockData: false
  })
});
```

**Response:**
```javascript
{
  inuvo_data: { /* Inuvo API response */ },
  google_ads_data: { /* Google Ads data */ },
  cost_revenue_mapping: [
    {
      TKID: 'online_tkid1',
      cost: 85.30,
      revenue: 125.50,
      profit: 40.20,
      roi: 47.1,
      platform: 'Desktop',
      campaign_name: 'Campaign Name',
      date: '2024-01-01'
    }
  ],
  summary: {
    totalCost: 152.80,
    totalRevenue: 215.25,
    totalProfit: 62.45,
    overallROI: 40.9,
    profitableCampaigns: 2,
    totalCampaigns: 2,
    profitabilityRate: 100
  }
}
```

## 📊 **Dashboard Access**

### **Inuvo Dashboard**: `/inuvo-dashboard`
- Dedicated Cost vs Revenue analysis
- Account filtering and date range selection
- Realtime vs Daily data options
- Mock data mode for testing

### **Main Dashboard**: `/dashboard`
- Integrated cost/revenue overview
- Existing Google Ads and Ads.com data
- Side-by-side comparison views

## 🛡️ **Bulletproof Protection**

The Inuvo integration uses the same **bulletproof protection** as Google Ads:
- **Rate limit compliance** with Google and Inuvo APIs
- **Intelligent fallbacks** to cached data
- **Mock data mode** when APIs are unavailable
- **Error handling** and graceful degradation

## 🔄 **TKID Mapping**

### **How It Works**
1. **Google Ads** provides campaign/ad data with cost
2. **Inuvo API** provides revenue data with TKID
3. **Mapping function** correlates data using TKID
4. **ROI calculation** determines profitability

### **TKID Sources**
- `ad.ad_id` (primary)
- `ad.campaign_id` (fallback)
- `ad.TKID` (direct mapping)

## 📈 **Sample Data**

### **Mock Data Available**
If no Inuvo API token is configured, the system uses realistic mock data:

```javascript
// Sample cost/revenue mapping
{
  TKID: 'online_tkid1',
  cost: 85.30,        // From Google Ads
  revenue: 125.50,    // From Inuvo
  profit: 40.20,      // Revenue - Cost
  roi: 47.1,          // ROI percentage
  platform: 'Desktop',
  campaign_name: 'Mock Campaign 1',
  date: '2024-01-01'
}
```

## 🚀 **Usage Examples**

### **Basic Cost/Revenue Fetch**
```javascript
import { fetchInuvoRealtimeData, mapCostRevenue } from '@/lib/inuvo-api';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

// Fetch both cost and revenue data
const googleAdsData = await bulletproofAPI.getData('2024-01-01', '2024-01-31');
const inuvoData = await fetchInuvoRealtimeData('2024-01-01', '2024-01-31');

// Create cost/revenue mapping
const mappings = mapCostRevenue(googleAdsData.ads, inuvoData.data);
```

### **Component Integration**
```jsx
import CostRevenueMapping from '@/components/Dashboard/CostRevenueMapping';

<CostRevenueMapping
  data={costRevenueMappings}
  summary={summary}
  loading={false}
  onRefresh={handleRefresh}
  showDetailedView={true}
/>
```

## 🔧 **Troubleshooting**

### **Common Issues**

1. **"No cost/revenue mappings found"**
   - Check TKID alignment between Google Ads and Inuvo data
   - Verify date ranges match between APIs

2. **"Inuvo API error"**
   - Verify `INUVO_ACCESS_TOKEN` is correct
   - Check API rate limits
   - Try mock data mode for testing

3. **"No data available"**
   - Ensure date range has actual campaign data
   - Check account ID filtering
   - Verify API permissions

### **Debug Mode**
Add to `.env.local`:
```bash
DEBUG_INUVO=true
DEBUG_GOOGLE_ADS=true
```

## 📞 **Support**

- **Dashboard**: `/inuvo-dashboard` for dedicated analysis
- **Health Check**: `GET /api/inuvo` for system status
- **Mock Mode**: Enable in dashboard settings for testing
- **Auto Refresh**: 5-minute intervals for live data

---

**🎉 Your cost vs revenue analysis is now fully integrated with bulletproof protection!**





