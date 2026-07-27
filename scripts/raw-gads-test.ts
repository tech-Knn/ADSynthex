import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function test() {
  const { GoogleAdsApi } = await import('google-ads-api');
  const { MCC_CONFIGS } = await import('../lib/mcc-config');

  const creds = MCC_CONFIGS['primary'].googleAds;
  const client = new GoogleAdsApi({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    developer_token: creds.developerToken,
  });

  const ids = [
    { id: '2324382023', name: 'CarHp New 06' },
    { id: '8613393445', name: 'CarHp New 07' },
    { id: '8817588152', name: 'CarHp New 08' },
    { id: '5106471180', name: 'CarHp New 09' },
    { id: '1594975507', name: 'CarHp New 10' }
  ];

  for (const acc of ids) {
    try {
      const customer = client.Customer({
        customer_id: acc.id,
        refresh_token: creds.refreshToken,
        login_customer_id: MCC_CONFIGS['primary'].mccId,
      });

      const query = `
        SELECT campaign.id, metrics.cost_micros, metrics.impressions 
        FROM campaign 
        WHERE segments.date BETWEEN '2026-03-01' AND '2026-03-26'
      `;
      const response = await customer.query(query);
      
      let cost = 0;
      let impressions = 0;
      for (const r of response) {
         cost += (r.metrics?.cost_micros || 0) / 1000000;
         impressions += r.metrics?.impressions || 0;
      }
      
      console.log(`${acc.name} (${acc.id}) -> Campaigns: ${response.length}, Impressions: ${impressions}, Cost: $${cost.toFixed(2)}`);
    } catch (e: any) {
      console.error(`${acc.name} ERROR: ${e.message}`);
    }
  }
}

test();
