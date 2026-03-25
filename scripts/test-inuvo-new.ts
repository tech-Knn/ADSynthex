import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function test() {
  const { fetchInuvoRealtimeData, mapCostRevenue } = await import('../lib/inuvo-api');
  const { bulletproofAPI } = await import('../lib/bulletproof-google-ads-api');

  const startDate = '2026-03-25';
  const endDate = '2026-03-25';
  const accountId = '9532228491';

  try {
    console.log("=== Fetching Inuvo Realtime ===");
    const realtime = await fetchInuvoRealtimeData(startDate, endDate);
    console.log(`Inuvo Data Count: ${realtime.data?.length || 0}`);
    if (realtime.data && realtime.data.length > 0) {
       console.log("Sample realtime Inuvo record:", realtime.data[0]);
    }

    console.log(`\n=== Fetching Google Ads Data for ${accountId} ===`);
    const response = await bulletproofAPI.getData(startDate, endDate, accountId, {
       feedType: 'inuvo', // Match what the app does
       allowStale: false  // Force fresh data
    });
    
    const googleAdsData = response.data?.ads || [];

    console.log(`Google Ads Data Count: ${googleAdsData?.length || 0}`);
    if (googleAdsData && googleAdsData.length > 0) {
      console.log("Sample Google Ads record:", {
        campaign_name: googleAdsData[0].campaign_name,
        campaign_id: googleAdsData[0].campaign_id,
        ad_id: googleAdsData[0].ad_id,
        cost: googleAdsData[0].metrics?.cost
      });
    }

    if (realtime.data && googleAdsData) {
      const mapping = mapCostRevenue(googleAdsData, realtime.data);
      console.log("\n=== Testing Mapping ===");
      console.log("Mapped Records:", mapping.length);
      if (mapping.length > 0) {
        console.log("Sample Mapped Record:", mapping[mapping.length - 1]);
        
        const mappedWithRevenue = mapping.filter(m => (m as any).revenue > 0);
        console.log(`\nMapped Records with >$0 Revenue: ${mappedWithRevenue.length}`);
      }
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
