import axios from 'axios';

// Create an Axios instance for Ads.com API
const adsComClient = axios.create({
  baseURL: process.env.ADSCOM_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': process.env.ADSCOM_API_KEY || ''
  }
});

export interface AdsComArticleData {
  article: string;
  country: string;
  visits: number;
  clicks: number;
  ctr: string;
  rpm: number;
  epc: number;
  revenue: number;
  initialRevenue: number;
  ivtCorrection: number;
  finalized?: boolean;   // Add flag to know if revenue is finalized or still estimated
}

export interface AdsComResponse {
  data: AdsComArticleData[];
  totalArticles: number;
  totalVisits: number;
  totalClicks: number;
  totalRevenue: number;
  averageCtr: number;
  averageRpm: number;
}

// Fetch article performance data from Ads.com
export async function fetchArticlePerformance(startDate: string, endDate: string): Promise<AdsComResponse> {
  try {
    const response = await adsComClient.get('/article-performance', {
      params: {
        startDate,
        endDate
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching Ads.com article performance:', error);
    throw error;
  }
}

// Fetch revenue data from Ads.com
export async function fetchRevenueData(startDate: string, endDate: string): Promise<any> {
  try {
    const response = await adsComClient.get('/revenue', {
      params: {
        startDate,
        endDate
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching Ads.com revenue data:', error);
    throw error;
  }
}

// For development/testing purposes when API is not available
export function getMockArticleData(startDate?: string, endDate?: string): AdsComResponse {
  console.log(`Generating mock Ads.com data for date range: ${startDate || 'default'} to ${endDate || 'default'}`);
  
  // If we have specific dates, adjust the mock data
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate days between dates
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // For single day requests, provide a day-specific variation
    if (daysDiff === 1) {
      console.log(`Generating single-day mock data for: ${startDate}`);
      return generateSingleDayMockData(startDate);
    }
    
    // For multi-day ranges but not the standard 3 days
    if (daysDiff !== 3) {
      console.log(`Adjusting mock data for ${daysDiff}-day range`);
      // Could implement logic here to adjust mock data based on range length
    }
  }
  
  // Default mock data (for 3-day range)
  return {
    data: [
      {
        article: 'freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions',
        country: '4 countries',
        visits: 2844,
        clicks: 1234,
        ctr: '43.39%',
        rpm: 26.00,
        epc: 0.0599,
        revenue: 73.95,
        initialRevenue: 72.37,
        ivtCorrection: -1.58
      },
      {
        article: 'freshcuesdaily.com/revving-up-your-automotive-knowledge-essential-insights-into-innovation-safety-and-sustainable-choices',
        country: '24 countries',
        visits: 144,
        clicks: 574,
        ctr: '398.61%',
        rpm: 379.93,
        epc: 0.0953,
        revenue: 54.71,
        initialRevenue: 52.35,
        ivtCorrection: -2.36
      },
      {
        article: 'freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions',
        country: '23 countries',
        visits: 3339,
        clicks: 2210,
        ctr: '66.19%',
        rpm: 45.26,
        epc: 0.0684,
        revenue: 151.12,
        initialRevenue: 149.98,
        ivtCorrection: -1.14
      },
      {
        article: 'freshcuesdaily.com/industrial-crusher-machines-enhancing-efficiency-in-high-demand-lump-crushing-industry',
        country: '10 countries',
        visits: 2285,
        clicks: 1149,
        ctr: '50.28%',
        rpm: 30.11,
        epc: 0.0618,
        revenue: 68.80,
        initialRevenue: 70.25,
        ivtCorrection: 1.45
      },
      {
        article: 'freshcuesdaily.com/exploring-the-world-of-bioreactors-a-vital-tool-in-biotechnology',
        country: '9 countries',
        visits: 3009,
        clicks: 1182,
        ctr: '39.28%',
        rpm: 22.83,
        epc: 0.0570,
        revenue: 68.69,
        initialRevenue: 70.14,
        ivtCorrection: 1.45
      },
      {
        article: 'freshcuesdaily.com/revolutionizing-the-industry-with-industrial-crusher-machines',
        country: '6 countries',
        visits: 2556,
        clicks: 1107,
        ctr: '43.31%',
        rpm: 39.12,
        epc: 0.0598,
        revenue: 66.24,
        initialRevenue: 67.56,
        ivtCorrection: 1.32
      },
      {
        article: 'freshcuesdaily.com/metal-stamping-machines-for-industrial-precision',
        country: '4 countries',
        visits: 1383,
        clicks: 762,
        ctr: '55.10%',
        rpm: 31.42,
        epc: 0.0479,
        revenue: 36.50,
        initialRevenue: 37.23,
        ivtCorrection: 0.73
      }
    ],
    totalArticles: 519,
    totalVisits: 25000,
    totalClicks: 12500,
    totalRevenue: 5250.75,
    averageCtr: 50.0,
    averageRpm: 210.03
  };
}

// Generate single-day specific mock data
function generateSingleDayMockData(dateString: string): AdsComResponse {
  // Calculate a factor based on which day it is (to make data different per day)
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dateFactor = (day * 0.1) + (month * 0.05);
  
  // Create a variation of the standard mock data
  const isToday = dateString === new Date().toISOString().split('T')[0];
  const isYesterday = dateString === new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Base factor for the day
  const factor = 0.35 + dateFactor;
  
  // Today will have slightly higher numbers than yesterday
  const adjustedFactor = isToday ? factor * 1.2 : (isYesterday ? factor * 0.9 : factor);
  
  console.log(`Mock data for ${dateString} using factor: ${adjustedFactor.toFixed(2)}`);
  
  const mockData = {
    data: [
      {
        article: 'freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions',
        country: '4 countries',
        visits: Math.round(2844 * adjustedFactor),
        clicks: Math.round(1234 * adjustedFactor),
        ctr: '43.39%',
        rpm: 26.00,
        epc: 0.0599,
        revenue: parseFloat((73.95 * adjustedFactor).toFixed(2)),
        initialRevenue: parseFloat((72.37 * adjustedFactor).toFixed(2)),
        ivtCorrection: parseFloat((-1.58 * adjustedFactor).toFixed(2))
      },
      {
        article: 'freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions',
        country: '23 countries',
        visits: Math.round(3339 * adjustedFactor),
        clicks: Math.round(2210 * adjustedFactor),
        ctr: '66.19%',
        rpm: 45.26,
        epc: 0.0684,
        revenue: parseFloat((151.12 * adjustedFactor).toFixed(2)),
        initialRevenue: parseFloat((149.98 * adjustedFactor).toFixed(2)),
        ivtCorrection: parseFloat((-1.14 * adjustedFactor).toFixed(2))
      },
      {
        article: 'freshcuesdaily.com/industrial-crusher-machines-enhancing-efficiency-in-high-demand-lump-crushing-industry',
        country: '10 countries',
        visits: Math.round(2285 * adjustedFactor),
        clicks: Math.round(1149 * adjustedFactor),
        ctr: '50.28%',
        rpm: 30.11,
        epc: 0.0618,
        revenue: parseFloat((68.80 * adjustedFactor).toFixed(2)),
        initialRevenue: parseFloat((70.25 * adjustedFactor).toFixed(2)),
        ivtCorrection: parseFloat((1.45 * adjustedFactor).toFixed(2))
      }
    ],
    // Calculate totals from the articles
    totalArticles: 473,
    totalVisits: 0,
    totalClicks: 0,
    totalRevenue: 0,
    averageCtr: 0,
    averageRpm: 0
  };
  
  // Calculate aggregates
  mockData.totalVisits = mockData.data.reduce((sum, item) => sum + item.visits, 0);
  mockData.totalClicks = mockData.data.reduce((sum, item) => sum + item.clicks, 0);
  mockData.totalRevenue = parseFloat(mockData.data.reduce((sum, item) => sum + item.revenue, 0).toFixed(2));
  mockData.averageCtr = mockData.totalVisits > 0 ? (mockData.totalClicks / mockData.totalVisits) * 100 : 0;
  mockData.averageRpm = mockData.totalVisits > 0 ? (mockData.totalRevenue / mockData.totalVisits) * 1000 : 0;
  
  return mockData;
} 