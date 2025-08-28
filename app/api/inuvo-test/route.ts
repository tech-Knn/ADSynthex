/**
 * Inuvo API Test Endpoint
 * Quick test to verify TKID mapping and API connectivity
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchInuvoRealtimeData, getMockInuvoData } from '@/lib/inuvo-api';

export async function GET(request: NextRequest) {
  try {
    console.log('[INUVO_TEST] Starting API connectivity test...');
    
    const hasApiKey = !!process.env.INUVO_ACCESS_TOKEN;
    const testDate = new Date().toISOString().split('T')[0];
    
    let testResult = {
      api_configured: hasApiKey,
      api_token_length: hasApiKey ? process.env.INUVO_ACCESS_TOKEN!.length : 0,
      test_date: testDate,
      account_id: '7195529443',
      test_results: {} as any
    };

    if (hasApiKey) {
      try {
        console.log('[INUVO_TEST] Testing live Inuvo API...');
        
        // Test with last 3 days to ensure we get some data
        const endDate = testDate;
        const startDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const liveData = await fetchInuvoRealtimeData(startDate, endDate, '7195529443');
        
        testResult.test_results.live_api = {
          success: true,
          total_earnings: liveData.total_earnings,
          total_records: liveData.data.length,
          tkids_found: liveData.data.map(item => item.TKID).filter(Boolean),
          sample_data: liveData.data.slice(0, 2), // First 2 records
          message: 'Live API test successful'
        };
        
        console.log(`[INUVO_TEST] ✅ Live API: ${liveData.data.length} records, $${liveData.total_earnings}`);
        
      } catch (liveError) {
        console.error('[INUVO_TEST] Live API test failed:', liveError);
        testResult.test_results.live_api = {
          success: false,
          error: liveError instanceof Error ? liveError.message : 'Unknown error',
          message: 'Live API test failed'
        };
      }
    } else {
      testResult.test_results.live_api = {
        success: false,
        error: 'No API token configured',
        message: 'Set INUVO_ACCESS_TOKEN in .env.local'
      };
    }
    
    // Always test mock data
    console.log('[INUVO_TEST] Testing mock data...');
    const mockData = getMockInuvoData(testDate, testDate);
    
    testResult.test_results.mock_data = {
      success: true,
      total_earnings: mockData.total_earnings,
      total_records: mockData.data.length,
      tkids_found: mockData.data.map(item => item.TKID),
      sample_data: mockData.data.slice(0, 2),
      message: 'Mock data test successful'
    };
    
    console.log(`[INUVO_TEST] ✅ Mock data: ${mockData.data.length} records, $${mockData.total_earnings}`);
    
    // TKID extraction test
    const sampleUrls = [
      'https://example.com/article?tkid=article_123456&utm_source=google',
      'https://site.com/news/tkid/article_789012',
      'https://domain.com/content-tkid-article_345678'
    ];
    
    // We need to import the function or recreate it here
    const extractTKIDFromURL = (url: string): string | null => {
      try {
        if (!url) return null;
        
        const urlParams = new URLSearchParams(url.split('?')[1] || '');
        const tkidParam = urlParams.get('tkid') || urlParams.get('TKID');
        if (tkidParam) return tkidParam;
        
        const tkidPathMatch = url.match(/\/tkid\/([^\/\?]+)/i);
        if (tkidPathMatch) return tkidPathMatch[1];
        
        const tkidDashMatch = url.match(/tkid[-_]([^\/\?&]+)/i);
        if (tkidDashMatch) return tkidDashMatch[1];
        
        return null;
      } catch (error) {
        return null;
      }
    };
    
    testResult.test_results.tkid_extraction = {
      success: true,
      test_urls: sampleUrls.map(url => ({
        url,
        extracted_tkid: extractTKIDFromURL(url)
      })),
      message: 'TKID extraction test completed'
    };
    
    console.log('[INUVO_TEST] ✅ All tests completed');
    
    return NextResponse.json({
      status: 'test_completed',
      timestamp: new Date().toISOString(),
      ...testResult
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
  } catch (error) {
    console.error('[INUVO_TEST] Test failed:', error);
    
    return NextResponse.json({
      status: 'test_failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    message: 'Use GET method for testing',
    endpoints: {
      test: 'GET /api/inuvo-test',
      main: 'POST /api/inuvo',
      dashboard: '/inuvo-dashboard'
    }
  }, { status: 405 });
}




