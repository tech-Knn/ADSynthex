import { NextRequest, NextResponse } from 'next/server';
import { fetchArticlePerformance, getMockArticleData, AdsComArticleData, AdsComResponse } from '../../../lib/adscom-api';

// Helper to transform and map API response
const transformApiData = (apiResponse: any): AdsComResponse => {
  if (!apiResponse || !apiResponse.data || !Array.isArray(apiResponse.data)) {
    console.warn('Invalid API response structure:', apiResponse);
    return { 
      data: [],
      totalArticles: 0,
      totalVisits: 0,
      totalClicks: 0,
      totalRevenue: 0,
      averageCtr: 0,
      averageRpm: 0
    };
  }
  
  try {
    // Group data by article to aggregate countries
    const articleMap = new Map();
    
    apiResponse.data.forEach((item: any) => {
      // Extract URL/article from subid_5 
      // Per docs: subid_5 holds article information that needs to be parsed
      const subid5Value = item.subid_5 || '';
      
      // Try to extract meaningful article information from subid_5
      // Usually in format "article-ACTUALVALUE" or just the article URL
      let article = subid5Value;
      
      // If the subid has a slash, it's likely a full URL - use it directly
      if (!subid5Value.includes('/') && subid5Value.includes('-')) {
        // If it's using the recommended format with prefix, extract the value part
        const parts = subid5Value.split('-');
        if (parts.length > 1) {
          // Take everything after the first dash
          article = parts.slice(1).join('-');
        }
      }
      
      // Format country
      const countryCode = item.country_code || 'Unknown';
      
      // Calculate metrics
      const visits = parseInt(item.visits) || 0;
      const clicks = parseInt(item.clicks) || 0;
      // Calculate CTR ourselves instead of using API value
      const ctr = visits > 0 ? `${((clicks / visits) * 100).toFixed(2)}%` : '0.00%';
      const revenue = parseFloat(item.estimated_revenue) || 0;
      const rpm = visits > 0 ? (revenue / visits) * 1000 : 0;
      const epc = clicks > 0 ? revenue / clicks : 0;
      // Since we can't get finalized status from API, set a default value
      // Per documentation, estimated revenue is updated every 15 minutes
      // We'll assume all data less than 6 hours old is not yet final
      const currentTime = new Date().getTime();
      const sixHoursAgo = currentTime - (6 * 60 * 60 * 1000);
      const isRecent = true; // Consider all data as recent since we can't determine age
      const finalized = false; // Set all data as not finalized to be conservative
      
      // Add or update the article in the map
      if (articleMap.has(article)) {
        const existingArticle = articleMap.get(article);
        existingArticle.visits += visits;
        existingArticle.clicks += clicks;
        existingArticle.revenue += revenue;
        existingArticle.finalized = existingArticle.finalized && finalized; // Only final if all entries are final
        
        // Track countries
        if (countryCode && !existingArticle.countries.includes(countryCode)) {
          existingArticle.countries.push(countryCode);
        }
      } else {
        articleMap.set(article, {
          article,
          countries: countryCode ? [countryCode] : [],
          visits,
          clicks,
          revenue,
          rpm,
          epc,
          finalized
        });
      }
    });
    
    // Convert the map values to an array
    const articles: AdsComArticleData[] = Array.from(articleMap.values()).map(item => {
      // Format countries display text
      let countryText = '';
      if (item.countries.length === 1) {
        countryText = item.countries[0];
      } else if (item.countries.length > 1) {
        countryText = `${item.countries.length} countries`;
      }
      
      // Recalculate metrics based on aggregated data
      const ctr = item.visits > 0 ? `${((item.clicks / item.visits) * 100).toFixed(2)}%` : '0.00%';
      const rpm = item.visits > 0 ? (item.revenue / item.visits) * 1000 : 0;
      const epc = item.clicks > 0 ? item.revenue / item.clicks : 0;
      
      return {
        article: item.article,
        country: countryText,
        visits: item.visits,
        clicks: item.clicks,
        ctr,
        rpm,
        epc,
        revenue: item.revenue,
        initialRevenue: item.revenue,
        ivtCorrection: 0,
        finalized: item.finalized
      };
    });
    
    // Sort by revenue (highest first)
    articles.sort((a, b) => b.revenue - a.revenue);
    
    // Calculate totals
    const totalArticles = articles.length;
    const totalVisits = articles.reduce((sum, item) => sum + item.visits, 0);
    const totalClicks = articles.reduce((sum, item) => sum + item.clicks, 0);
    const totalRevenue = articles.reduce((sum, item) => sum + item.revenue, 0);
    const averageCtr = totalVisits > 0 ? (totalClicks / totalVisits) * 100 : 0;
    const averageRpm = totalVisits > 0 ? (totalRevenue / totalVisits) * 1000 : 0;
    
    return {
      data: articles,
      totalArticles,
      totalVisits,
      totalClicks,
      totalRevenue,
      averageCtr,
      averageRpm
    };
  } catch (error) {
    console.error('Error transforming API data:', error);
    return { 
      data: [],
      totalArticles: 0,
      totalVisits: 0,
      totalClicks: 0,
      totalRevenue: 0,
      averageCtr: 0,
      averageRpm: 0
    };
  }
};

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate } = await request.json();
    console.log(`Ads.com API request for date range: ${startDate} to ${endDate}`);
    console.log('DEBUG: Current time', new Date().toISOString());
    
    // Debug: Print all environment variables
    console.log('Environment variables for Ads.com:');
    console.log('ADSCOM_API_KEY:', process.env.ADSCOM_API_KEY ? 'Set (length: ' + process.env.ADSCOM_API_KEY.length + ')' : 'Not set');
    console.log('ADSCOM_API_URL:', process.env.ADSCOM_API_URL || 'Not set');
    console.log('ADSCOM_API_ENDPOINT:', process.env.ADSCOM_API_ENDPOINT || 'Not set');
    
    // Try to use real API data
    try {
      // Check if we have all required environment variables
      const requiredEnvVars = [
        'ADSCOM_API_KEY',
        'ADSCOM_API_URL'
      ];
      
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.warn(`Missing environment variables for Ads.com API: ${missingVars.join(', ')}`);
        throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
      }
      
      // No strict date-range limit for estimated revenue endpoint; use the picker range directly
      const apiStartDate = startDate;
      const apiEndDate = endDate;
      console.log(`Using date range for estimated revenue: ${apiStartDate} to ${apiEndDate}`);
      
      // Request body for /ads/reports/parking-events (estimated revenue)
      const body = {
        columns: [
          'subid_5',
          'country_code',
          'visits',
          'clicks',
          'estimated_revenue'
        ],
        filter_by: [
          {
            column: 'server_datetime',
            operator: 'between',
            value: [`${apiStartDate} 00:00:00`, `${apiEndDate} 23:59:59`]
          }
        ],
        group_by: ['subid_5', 'country_code'],
        order_by: [{ column: 'estimated_revenue', order: 'desc' }],
        page: 1,
        per_page: 1000
      };

      // Extract just the domain part from ADSCOM_API_URL to avoid path duplication
      const apiBaseUrl = process.env.ADSCOM_API_URL || '';
      
      // According to docs, the correct endpoint is /ads/reports/parking-events
      let apiUrl = '';
      if (apiBaseUrl.includes('/parking-events')) {
        // URL already contains the endpoint
        apiUrl = apiBaseUrl;
      } else if (apiBaseUrl.endsWith('/reports')) {
        // URL has /reports but needs /parking-events
        apiUrl = `${apiBaseUrl}/parking-events`;
      } else {
        // Add the full path if neither exists
        apiUrl = `${apiBaseUrl}/ads/reports/parking-events`;
      }

      console.log('Fetching real Ads.com data from URL:', apiUrl);
      console.log('Request body:', JSON.stringify(body, null, 2));
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.ADSCOM_API_KEY || '',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify(body),
        cache: 'no-store'
      });

      // Log more details about the response
      console.log('Ads.com API response status:', response.status, response.statusText);
      
      if (response.ok) {
        const rawData = await response.json();
        console.log(`Successfully fetched Ads.com data: ${rawData.data?.length || 0} articles`);
        
        // Transform API data to expected format
        const transformedData = transformApiData(rawData);
        console.log(`Transformed data: ${transformedData.data.length} articles`);
        
        return NextResponse.json(transformedData, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      }

      // Try to get more detailed error information
      let errorText = '';
      try {
        const errorData = await response.text();
        errorText = errorData;
        console.error('Ads.com API error details:', errorData);
      } catch (e) {
        console.error('Could not parse error response:', e);
      }

      throw new Error(`Ads.com API error: ${response.status} ${response.statusText} - ${errorText}`);
    } catch (apiErr) {
      console.error('Ads.com API error, falling back to mock:', apiErr);
      const mockData = getMockArticleData(startDate, endDate);
      console.log(`DEBUG: Using mock data with ${mockData.data.length} articles for date range ${startDate} to ${endDate}`);
      console.log('DEBUG: Mock data first article revenue:', mockData.data[0]?.revenue);
      console.log('DEBUG: Mock data for industrial packaging article:', 
        mockData.data.find(a => a.article.includes('revolutionizing-industrial-packaging')));
      return NextResponse.json(mockData, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }
    
  } catch (error) {
    console.error('Error processing Ads.com request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Ads.com data' }, 
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const startDate = url.searchParams.get('startDate') || '';
    const endDate = url.searchParams.get('endDate') || '';
    
    console.log(`GET: Ads.com API request for date range: ${startDate} to ${endDate}`);
    
    // For now, immediately use mock data while debugging
    console.log('Using mock Ads.com data for GET debugging');
    const mockData = getMockArticleData(startDate, endDate);
    console.log(`Mock data: ${mockData.data.length} articles for date range ${startDate} to ${endDate}`);
    return NextResponse.json(mockData, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error) {
    console.error('Error processing Ads.com GET request:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Ads.com data' }, 
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  }
}