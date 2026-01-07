export interface PredictoUrlParams {
  domain: string;
  articleId: string;
  channelId: string;
  useHttps?: boolean;
}

export interface GeneratedPredictoUrl {
  url: string;
  template: string;
  params: PredictoUrlParams;
  googleAdsMacros: {
    campaignId: string;
    adGroupId: string;
    creativeId: string;
    customerId: string;
  };
}

export function buildPredictoTrackingUrl(params: PredictoUrlParams): GeneratedPredictoUrl {
  const { domain, articleId, channelId, useHttps = true } = params;

  if (!domain || !articleId || !channelId) {
    throw new Error('Missing required parameters: domain, articleId, and channelId are required');
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '');
  const protocol = useHttps ? 'https' : 'http';
  const baseUrl = `${protocol}://${cleanDomain}/asrsearch`;

  const queryParams = new URLSearchParams({
    search: articleId,
    source: 'googleads',
    cid: channelId,
    campaign_id: '{campaignid}',
    adset_id: '{adgroupid}',
    ad_id: '{creative}',
    account_id: '{customerid}',
    event: 'lead',
  });

  const fullUrl = `${baseUrl}?${queryParams.toString()}`;

  return {
    url: fullUrl,
    template: `${protocol}://[domain]/asrsearch?search=[article_id]&source=googleads&cid=[channel_id]&campaign_id={campaignid}&adset_id={adgroupid}&ad_id={creative}&account_id={customerid}&event=lead`,
    params,
    googleAdsMacros: {
      campaignId: '{campaignid}',
      adGroupId: '{adgroupid}',
      creativeId: '{creative}',
      customerId: '{customerid}',
    },
  };
}

export function extractCampaignIdFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get('campaign_id');
  } catch {
    return null;
  }
}

export function isValidPredictoUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);

    if (!urlObj.pathname.includes('/asrsearch')) return false;

    const requiredParams = ['search', 'source', 'cid', 'campaign_id', 'event'];
    const hasAllParams = requiredParams.every((param) => urlObj.searchParams.has(param));

    return (
      hasAllParams &&
      urlObj.searchParams.get('source') === 'googleads' &&
      urlObj.searchParams.get('event') === 'lead'
    );
  } catch {
    return false;
  }
}

export function parsePredictoUrl(url: string) {
  try {
    const urlObj = new URL(url);

    return {
      domain: urlObj.hostname,
      articleId: urlObj.searchParams.get('search') || '',
      channelId: urlObj.searchParams.get('cid') || '',
      campaignId: urlObj.searchParams.get('campaign_id') || '',
      adGroupId: urlObj.searchParams.get('adset_id') || '',
      adId: urlObj.searchParams.get('ad_id') || '',
      accountId: urlObj.searchParams.get('account_id') || '',
    };
  } catch {
    return null;
  }
}

export function buildBatchPredictoUrls(
  baseDomain: string,
  articles: string[],
  channelId: string
): GeneratedPredictoUrl[] {
  return articles.map((articleId) =>
    buildPredictoTrackingUrl({ domain: baseDomain, articleId, channelId })
  );
}

export function replaceGoogleAdsMacros(
  templateUrl: string,
  values: {
    campaignId: string;
    adGroupId: string;
    creativeId: string;
    customerId: string;
  }
): string {
  return templateUrl
    .replace('{campaignid}', values.campaignId)
    .replace('{adgroupid}', values.adGroupId)
    .replace('{creative}', values.creativeId)
    .replace('{customerid}', values.customerId);
}

export const normalizeCampaignId = (campaignId: string | number): string =>
  String(campaignId).trim();
