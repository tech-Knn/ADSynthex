import { NextRequest, NextResponse } from 'next/server';
import { initializeGoogleAdsClient } from '@/lib/google-ads-api';

export async function POST(request: NextRequest) {
  try {
    const { name, bidAmount, keywords, campaignId } = await request.json();
    
    console.log('Creating ad group with data:', { name, bidAmount, keywords, campaignId });
    
    // Validate required fields (bidAmount is optional for some bidding strategies)
    if (!name || !campaignId) {
      return NextResponse.json(
        { error: 'Missing required fields: name, campaignId' },
        { status: 400 }
      );
    }

    // Initialize Google Ads client
    const { client, customer } = initializeGoogleAdsClient();
    
    // Convert bid amount to micros (only if provided)
    const bidMicros = bidAmount ? Math.round(bidAmount * 1000000) : null;
    
    // Create campaign resource name
    const campaignResourceName = `customers/${process.env.GOOGLE_ADS_MANAGER_ID}/campaigns/${campaignId}`;

    // Create ad group using mutate_ad_groups
    const adGroupResource: any = {
      name: name,
      status: 'ENABLED',
      campaign: campaignResourceName,
      type: 'SEARCH_STANDARD'
    };

    // Only add CPC bid if provided (manual bidding strategies)
    if (bidMicros) {
      adGroupResource.cpc_bid_micros = bidMicros;
    }

    const adGroupResponse = await customer.adGroups.create([adGroupResource]);
    const adGroupResourceName = adGroupResponse.results?.[0]?.resource_name;
    
    if (!adGroupResourceName) {
      throw new Error('Failed to create ad group: No resource name returned');
    }
    
    // Extract ad group ID from resource name
    const adGroupId = adGroupResourceName.split('/').pop();

    console.log('Created ad group:', adGroupResourceName, 'with ID:', adGroupId);

    // Add keywords if provided
    const keywordResults = [];
    if (keywords && keywords.length > 0) {
      console.log('Adding keywords:', keywords);
      
      const keywordOperations = keywords.map((keyword: string) => ({
        create: {
          ad_group: adGroupResourceName,
          status: 'ENABLED',
          keyword: {
            text: keyword.trim(),
            match_type: 'BROAD' // You can make this configurable
          }
        }
      }));

      try {
        const keywordResources = keywordOperations.map((op: any) => op.create);
        const keywordResponse = await customer.adGroupCriteria.create(keywordResources);
        keywordResults.push(...keywordResponse.results);
        console.log(`Added ${keywordResults.length} keywords successfully`);
      } catch (keywordError) {
        console.warn('Failed to add some keywords:', keywordError);
        // Continue anyway, keywords are optional for ad group creation
      }
    }

    return NextResponse.json({
      success: true,
      adGroupId: adGroupId,
      adGroupResourceName: adGroupResourceName,
      keywordsAdded: keywordResults.length,
      message: `Ad group "${name}" created successfully with ${keywordResults.length} keywords`
    });

  } catch (error: any) {
    console.error('Error creating ad group:', error);
    
    // Handle specific Google Ads API errors
    if (error.message?.includes('quota') || error.message?.includes('QUOTA_EXCEEDED')) {
      return NextResponse.json(
        { error: 'API quota exceeded. Please try again later.' },
        { status: 429 }
      );
    }
    
    if (error.message?.includes('authentication') || error.message?.includes('UNAUTHENTICATED')) {
      return NextResponse.json(
        { error: 'Authentication failed. Please check API credentials.' },
        { status: 401 }
      );
    }

    if (error.message?.includes('INVALID_CAMPAIGN_ID')) {
      return NextResponse.json(
        { error: 'Invalid campaign ID provided.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Failed to create ad group',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
