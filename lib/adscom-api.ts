import axios from 'axios';

// Create an Axios instance for Ads.com API
const adsComClient = axios.create({
  baseURL: process.env.ADSCOM_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
    'X-API-KEY': process.env.ADSCOM_API_KEY || ''
  }
});

export interface AdsComCountryData {
  country: string;
  visits: number;
  clicks: number;
  ctr: string;
  rpm: number;
  epc: number;
  revenue: number;
  initialRevenue: number;
  ivtCorrection: number;
  finalized?: boolean;
}

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
  countryBreakdown?: AdsComCountryData[];
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
  
  // Generate a consistent target count of 553 articles
  const targetArticleCount = 553;
  console.log(`Ensuring consistent count of ${targetArticleCount} mock articles`);
  
  // If we have specific dates, adjust the mock data
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate days between dates
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // For single day requests, provide a day-specific variation
    if (daysDiff === 1) {
      console.log(`Generating single-day mock data for: ${startDate}`);
      return generateSingleDayMockData(startDate, targetArticleCount);
    }
    
    // For multi-day ranges but not the standard 3 days
    if (daysDiff !== 3) {
      console.log(`Adjusting mock data for ${daysDiff}-day range`);
      // Could implement logic here to adjust mock data based on range length
    }
  }
  
  // Default mock data (for 3-day range)
  // Start with our base set of 7 articles
  const baseArticles = [
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
      country: '9 countries',
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
  ];
  
  // Generate additional articles to reach targetArticleCount
  const additionalCount = targetArticleCount - baseArticles.length;
  console.log(`Generating ${additionalCount} additional articles to reach ${targetArticleCount} total`);
  
  // Templates for additional articles
  const domains = [
    'freshcuesdaily.com', 
    'techinsightsweekly.com', 
    'innovationspotlight.net', 
    'futuretechtoday.com',
    'emergingtrendsreport.org',
    'nextgentechnology.info',
    'digitaltransformationhub.com'
  ];
  
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing',
    'digital-transformation'
  ];
  
  // Generate additional articles
  const additionalArticles: AdsComArticleData[] = [];
  for (let i = 0; i < additionalCount; i++) {
    // Random base article to use as template
    const baseArticle = baseArticles[i % baseArticles.length];
    
    // Random variation factor
    const variationFactor = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
    
    // Generate article URL
    const domain = domains[i % domains.length];
    const topic = topics[i % topics.length];
    const articleUrl = `${domain}/${topic}-article-${i + 8}`;
    
    // Calculate metrics
    const visits = Math.round(baseArticle.visits * variationFactor);
    const clicks = Math.round(baseArticle.clicks * variationFactor);
    const revenue = parseFloat((baseArticle.revenue * variationFactor).toFixed(2));
    const ivtPercentage = (Math.random() * 10) - 5; // Random between -5% and +5%
    const ivtCorrection = parseFloat((revenue * (ivtPercentage / 100)).toFixed(2));
    const initialRevenue = parseFloat((revenue - ivtCorrection).toFixed(2));
    
    // Random number of countries between 1 and 7 (more realistic count)
    const countryCount = Math.floor(Math.random() * 7) + 1;
    const country = countryCount === 1 ? 'US' : `${countryCount} countries`;
    
    // Calculate CTR, RPM, and EPC
    const ctr = clicks > 0 && visits > 0 ? `${((clicks / visits) * 100).toFixed(2)}%` : '0.00%';
    const rpm = visits > 0 ? parseFloat((revenue / visits * 1000).toFixed(2)) : 0;
    const epc = clicks > 0 ? parseFloat((revenue / clicks).toFixed(4)) : 0;
    
    additionalArticles.push({
      article: articleUrl,
      country,
      visits,
      clicks,
      ctr,
      rpm,
      epc,
      revenue,
      initialRevenue,
      ivtCorrection,
      finalized: Math.random() > 0.3 // 70% chance of being finalized
    });
  }
  
  // Combine all articles
  const allArticles = [...baseArticles, ...additionalArticles];
  
  // Calculate totals
  const totalArticles = allArticles.length;
  const totalVisits = allArticles.reduce((sum, item) => sum + item.visits, 0);
  const totalClicks = allArticles.reduce((sum, item) => sum + item.clicks, 0);
  const totalRevenue = allArticles.reduce((sum, item) => sum + item.revenue, 0);
  const averageCtr = totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0;
  const averageRpm = totalVisits > 0 ? (totalRevenue / totalVisits) * 1000 : 0;
  
  // Sort by revenue (highest first)
  allArticles.sort((a, b) => b.revenue - a.revenue);
  
  console.log(`Generated mock data with ${allArticles.length} articles, ${totalVisits} visits, $${totalRevenue.toFixed(2)} revenue`);
  
  return {
    data: allArticles,
    totalArticles,
    totalVisits,
    totalClicks,
    totalRevenue,
    averageCtr,
    averageRpm
  };
}

// Generate single-day specific mock data
function generateSingleDayMockData(dateString: string, targetArticleCount: number = 553): AdsComResponse {
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
  
  // Base articles with day-specific adjustments
  const baseArticles = [
    {
      article: 'freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions',
      country: '4 countries',
      visits: Math.round(2844 * adjustedFactor),
      clicks: Math.round(1234 * adjustedFactor),
      ctr: '43.39%',
      rpm: 26.00,
      epc: 0.0599
    },
    {
      article: 'freshcuesdaily.com/revving-up-your-automotive-knowledge-essential-insights-into-innovation-safety-and-sustainable-choices',
      country: '24 countries',
      visits: Math.round(144 * adjustedFactor),
      clicks: Math.round(574 * adjustedFactor),
      ctr: '398.61%',
      rpm: 379.93,
      epc: 0.0953
    },
    {
      article: 'freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions',
      country: '28 countries',
      visits: Math.round(3339 * adjustedFactor),
      clicks: Math.round(2210 * adjustedFactor),
      ctr: '66.19%',
      rpm: 45.26,
      epc: 0.0684
    },
    {
      article: 'freshcuesdaily.com/industrial-crusher-machines-enhancing-efficiency-in-high-demand-lump-crushing-industry',
      country: '9 countries',
      visits: Math.round(2285 * adjustedFactor),
      clicks: Math.round(1149 * adjustedFactor),
      ctr: '50.28%',
      rpm: 30.11,
      epc: 0.0618
    },
    {
      article: 'freshcuesdaily.com/exploring-the-world-of-bioreactors-a-vital-tool-in-biotechnology',
      country: '9 countries',
      visits: Math.round(3009 * adjustedFactor),
      clicks: Math.round(1182 * adjustedFactor),
      ctr: '39.28%',
      rpm: 22.83,
      epc: 0.0570
    },
    {
      article: 'freshcuesdaily.com/revolutionizing-the-industry-with-industrial-crusher-machines',
      country: '6 countries',
      visits: Math.round(2556 * adjustedFactor),
      clicks: Math.round(1107 * adjustedFactor),
      ctr: '43.31%',
      rpm: 39.12,
      epc: 0.0598
    },
    {
      article: 'freshcuesdaily.com/metal-stamping-machines-for-industrial-precision',
      country: '4 countries',
      visits: Math.round(1383 * adjustedFactor),
      clicks: Math.round(762 * adjustedFactor),
      ctr: '55.10%',
      rpm: 31.42,
      epc: 0.0479
    }
  ];
  
  // Templates for additional articles
  const domains = [
    'freshcuesdaily.com', 
    'techinsightsweekly.com', 
    'innovationspotlight.net', 
    'futuretechtoday.com',
    'emergingtrendsreport.org',
    'nextgentechnology.info',
    'digitaltransformationhub.com'
  ];
  
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing',
    'digital-transformation'
  ];
  
  // Generate additional articles to reach targetArticleCount
  const additionalCount = targetArticleCount - baseArticles.length;
  console.log(`Generating ${additionalCount} additional articles for single day ${dateString}`);
  
  // Generate the articles
  const allArticles: AdsComArticleData[] = [];
  
  // Process base articles first
  for (const article of baseArticles) {
    const revenue = parseFloat((article.rpm * article.visits / 1000).toFixed(2));
    const ivtData = generateIVTData(revenue);
    
    allArticles.push({
      ...article,
      revenue: ivtData.revenue,
      initialRevenue: ivtData.initialRevenue,
      ivtCorrection: ivtData.ivtCorrection,
      finalized: Math.random() > 0.3 // 70% chance of being finalized
    });
  }
  
  // Generate additional articles
  for (let i = 0; i < additionalCount; i++) {
    // Random base article to use as template
    const baseArticle = baseArticles[i % baseArticles.length];
    
    // Random variation factor adjusted by date factor
    const variationFactor = (0.3 + Math.random() * 0.7) * adjustedFactor; // 0.3 to 1.0 * date factor
    
    // Generate article URL
    const domain = domains[i % domains.length];
    const topic = topics[i % topics.length];
    const articleUrl = `${domain}/${topic}-article-${i + 8}`;
    
    // Calculate metrics
    const visits = Math.round(baseArticle.visits * variationFactor);
    const clicks = Math.round(baseArticle.clicks * variationFactor);
    const revenue = parseFloat((baseArticle.rpm * visits / 1000).toFixed(2));
    const ivtData = generateIVTData(revenue);
    
    // Random number of countries between 1 and 7 (more realistic count)
    const countryCount = Math.floor(Math.random() * 7) + 1;
    const country = countryCount === 1 ? 'US' : `${countryCount} countries`;
    
    // Calculate CTR
    const ctr = visits > 0 ? `${((clicks / visits) * 100).toFixed(2)}%` : '0.00%';
    const rpm = visits > 0 ? parseFloat((revenue / visits * 1000).toFixed(2)) : 0;
    const epc = clicks > 0 ? parseFloat((revenue / clicks).toFixed(4)) : 0;
    
    allArticles.push({
      article: articleUrl,
      country,
      visits,
      clicks,
      ctr,
      rpm,
      epc,
      revenue: ivtData.revenue,
      initialRevenue: ivtData.initialRevenue,
      ivtCorrection: ivtData.ivtCorrection,
      finalized: Math.random() > 0.3 // 70% chance of being finalized
    });
  }
  
  // Calculate totals
  const totalVisits = allArticles.reduce((sum, item) => sum + item.visits, 0);
  const totalClicks = allArticles.reduce((sum, item) => sum + item.clicks, 0);
  const totalRevenue = allArticles.reduce((sum, item) => sum + item.revenue, 0);
  const averageCtr = totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0;
  const averageRpm = totalVisits > 0 ? (totalRevenue / totalVisits) * 1000 : 0;
  
  // Sort by revenue (highest first)
  allArticles.sort((a, b) => b.revenue - a.revenue);
  
  console.log(`Generated single day mock data with ${allArticles.length} articles, ${totalVisits} visits, $${totalRevenue.toFixed(2)} revenue`);
  
  return {
    data: allArticles,
    totalArticles: allArticles.length,
    totalVisits,
    totalClicks,
    totalRevenue,
    averageCtr,
    averageRpm
  };
}

// Generate more varied IVT values to demonstrate the feature
const generateIVTData = (baseRevenue: number) => {
  // Generate a random IVT percentage between -20% and -5% (always negative with significant magnitude)
  const ivtPercentage = (Math.random() * 15) - 20;
  
  // Calculate the initial (estimated) revenue - always higher than final revenue
  const initialRevenue = parseFloat((baseRevenue / (1 + ivtPercentage / 100)).toFixed(2));
  
  // Calculate the IVT correction amount (initial - final)
  const ivtCorrection = parseFloat((initialRevenue - baseRevenue).toFixed(2));
  
  return {
    revenue: baseRevenue,
    initialRevenue,
    ivtCorrection
  };
};

// Base set of mock data
function getBaseMockData(): AdsComResponse {
  return {
    data: [
      // Existing 7 mock articles...
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
        ivtCorrection: -1.58,
        finalized: true
      },
      // ... other existing articles
    ],
    totalArticles: 7,
    totalVisits: 25000,
    totalClicks: 12500,
    totalRevenue: 5250.75,
    averageCtr: 50.0,
    averageRpm: 210.03
  };
}

// Generate additional mock articles for consistent count
function generateAdditionalMockArticles(count: number): AdsComArticleData[] {
  const articles: AdsComArticleData[] = [];
  
  // Templates to use for variation
  const baseTemplates = [
    {
      visits: 2800,
      clicks: 1200,
      ctrPercent: 43,
      rpm: 26.00,
      epc: 0.06,
      revenue: 75.00
    },
    {
      visits: 3300,
      clicks: 2200,
      ctrPercent: 66,
      rpm: 45.00,
      epc: 0.07,
      revenue: 150.00
    }
  ];
  
  // Generate additional articles
  for (let i = 0; i < count; i++) {
    const template = baseTemplates[i % baseTemplates.length];
    const variationFactor = 0.7 + (Math.random() * 0.6); // 0.7 to 1.3
    
    const visits = Math.round(template.visits * variationFactor);
    const clicks = Math.round(template.clicks * variationFactor);
    const revenue = parseFloat((template.revenue * variationFactor).toFixed(2));
    const ivtFactor = -0.05 + (Math.random() * 0.1); // -5% to +5%
    const ivtCorrection = parseFloat((revenue * ivtFactor).toFixed(2));
    
    articles.push({
      article: `freshcuesdaily.com/article-${i+8}`,
      country: `${Math.floor(Math.random() * 7) + 1} countries`,
      visits,
      clicks,
      ctr: `${template.ctrPercent}.${Math.floor(Math.random() * 100)}%`,
      rpm: parseFloat((template.rpm * variationFactor).toFixed(2)),
      epc: parseFloat((template.epc * variationFactor).toFixed(4)),
      revenue,
      initialRevenue: parseFloat((revenue - ivtCorrection).toFixed(2)),
      ivtCorrection,
      finalized: Math.random() > 0.3
    });
  }
  
  return articles;
} 