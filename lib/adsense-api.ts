import { E } from '@upstash/redis/zmscore-DWj9Vh1g';
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET,
});

const refreshToken = process.env.ADSENSE_REFRESH_TOKEN || process.env.GOOGLE_ADS_REFRESH_TOKEN;
if (refreshToken) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });
}

export interface AdSenseRevenue {
  date: string;
  style_id: string;
  country_name?: string;
  domain_name?: string;
  earnings: number;
  impressions: number;
  clicks: number;
}

async function getAccessToken(): Promise<string> {
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Failed to get AdSense access token');
  return token;
}

export async function fetchAdSenseRevenueByStyleId(
  accountId: string,
  startDate: string,
  endDate: string
): Promise<AdSenseRevenue[]> {
  try {
    console.log('[ADSENSE_API] Fetching revenue - Account:', accountId);
    console.log('[ADSENSE_API] Date range:', startDate, 'to', endDate);

    const token = await getAccessToken();
    console.log('[ADSENSE_API] Got access token:', token ? 'YES' : 'NO');

    // Split dates but keep as strings to preserve leading zeros
    const startParts = startDate.split('-');
    const endParts = endDate.split('-');

    // accountId is already in format "accounts/pub-XXX", so use it directly
    const url = new URL(`https://adsense.googleapis.com/v2/${accountId}/reports:generate`);
    console.log('[ADSENSE_API] Request URL:', url.toString());
    url.searchParams.set('dateRange', 'CUSTOM');
    url.searchParams.set('startDate.year', startParts[0]);
    url.searchParams.set('startDate.month', startParts[1]);
    url.searchParams.set('startDate.day', startParts[2]);
    url.searchParams.set('endDate.year', endParts[0]);
    url.searchParams.set('endDate.month', endParts[1]);
    url.searchParams.set('endDate.day', endParts[2]);

    url.searchParams.append('metrics', 'ESTIMATED_EARNINGS');
    url.searchParams.append('metrics', 'IMPRESSIONS');
    url.searchParams.append('metrics', 'CLICKS');
    url.searchParams.append('dimensions', 'DATE');
    url.searchParams.append('dimensions', 'CUSTOM_SEARCH_STYLE_ID');
    url.searchParams.append('dimensions', 'COUNTRY_NAME');
    url.searchParams.append('dimensions', 'DOMAIN_NAME');

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[ADSENSE_API] Response status:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[ADSENSE_API] API Error Response:', error.substring(0, 500));
      throw new Error(`AdSense API error (${response.status}): ${error.substring(0, 200)}`);
    }

    const data = await response.json();
    console.log('[ADSENSE_API] Response data:', {
      totalRows: data.totalMatchedRows,
      rowsReceived: data.rows?.length || 0,
      headers: data.headers?.length || 0
    });

    const revenues: AdSenseRevenue[] = [];

    for (const row of data.rows || []) {
      const cells = row.cells;
      const date = cells[0]?.value || '';
      const styleId = cells[1]?.value || '';
      const countryName = cells[2]?.value || '';
      const domainName = cells[3]?.value || '';
      const earnings = parseFloat(cells[4]?.value || '0');
      const impressions = parseInt(cells[5]?.value || '0', 10);
      const clicks = parseInt(cells[6]?.value || '0', 10);

      if (styleId && styleId !== '(not set)') {
        revenues.push({
          date,
          style_id: styleId,
          country_name: countryName === '(not set)' ? undefined : countryName,
          domain_name: domainName === '(not set)' ? undefined : domainName,
          earnings,
          impressions,
          clicks,
        });
      }
    }

    console.log(`[ADSENSE_API] Fetched ${revenues.length} revenue records`);
    return revenues;
  } catch (error: any) {
    console.error('[ADSENSE_API] Failed:', error.message);
    throw error;
  }
}

export function extractStyleIdFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get('style_id');
  } catch {
    return null;
  }
}

export function extractDomainFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

export async function getAdSenseAccounts(): Promise<any[]> {
  try {
    const token = await getAccessToken();

    const response = await fetch('https://adsense.googleapis.com/v2/accounts', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`AdSense API error: ${error}`);
    }

    const data = await response.json();
    const accounts = data.accounts || [];

    console.log(`[ADSENSE_API] Found ${accounts.length} AdSense accounts`);
    return accounts
      .map((account: any) => ({
        name: account.name,
        displayName: account.displayName || account.name.split('/').pop(),
        state: account.state,
      }));
  } catch (error: any) {
    console.error('[ADSENSE_API] Failed to fetch accounts:', error.message);
    throw error;
  }
}
