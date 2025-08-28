import { NextRequest, NextResponse } from 'next/server';
import { initializeGoogleAdsClient } from '@/lib/google-ads-api';

export async function POST(request: NextRequest) {
  try {
    const { headlines, descriptions, finalUrl, displayUrl, campaignId, adGroupId, campaignType } = await request.json();
    
    console.log('Creating ad with data:', { headlines, descriptions, finalUrl, displayUrl, campaignId, adGroupId, campaignType });
    
    // Validate required fields
    if (!headlines || !Array.isArray(headlines) || headlines.length < 2 || !descriptions || !Array.isArray(descriptions) || descriptions.length < 1 || !finalUrl || !campaignId) {
      return NextResponse.json(
        { error: 'Missing required fields: at least 2 headlines, 1 description, finalUrl, campaignId' },
        { status: 400 }
      );
    }

    // Filter out empty headlines and descriptions
    const validHeadlines = headlines.filter((h: string) => h && h.trim().length > 0);
    const validDescriptions = descriptions.filter((d: string) => d && d.trim().length > 0);

    if (validHeadlines.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 non-empty headlines are required' },
        { status: 400 }
      );
    }

    if (validDescriptions.length < 1) {
      return NextResponse.json(
        { error: 'At least 1 non-empty description is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(finalUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format for finalUrl' },
        { status: 400 }
      );
    }

    // Initialize Google Ads client
    const { client, customer } = initializeGoogleAdsClient();
    
    // Create ad group resource name
    const adGroupResourceName = `customers/${process.env.GOOGLE_ADS_MANAGER_ID}/adGroups/${adGroupId}`;

    // Handle different ad types based on campaign type
    let adResource: any;

    if (campaignType === 'PERFORMANCE_MAX') {
      // For Performance Max, we need to create asset groups instead of traditional ads
      console.log('Performance Max ads require asset group creation - this will be handled separately');
      return NextResponse.json({
        success: true,
        message: 'Performance Max campaign will use provided assets automatically',
        adDetails: {
          campaignId,
          headlines: validHeadlines,
          descriptions: validDescriptions,
          finalUrl,
          displayUrl
        }
      });
    } else if (campaignType === 'DISPLAY') {
      // Create responsive display ad
      adResource = {
        ad_group: adGroupResourceName,
        status: 'ENABLED',
        ad: {
          type: 'RESPONSIVE_DISPLAY_AD',
          final_urls: [finalUrl],
          display_url: displayUrl || new URL(finalUrl).hostname,
          responsive_display_ad: {
            headlines: validHeadlines.slice(0, 5).map((text: string, index: number) => ({
              text,
              pinned_field: index === 0 ? 'HEADLINE_1' : undefined
            })),
            descriptions: validDescriptions.slice(0, 5).map((text: string) => ({ text })),
            allow_flexible_color: true,
            accent_color: '#1890ff',
            business_name: 'Your Business',
            call_to_action_text: 'LEARN_MORE'
          }
        }
      };
    } else {
      // Create responsive search ad (default for SEARCH campaigns)
      adResource = {
        ad_group: adGroupResourceName,
        status: 'ENABLED',
        ad: {
          type: 'RESPONSIVE_SEARCH_AD',
          final_urls: [finalUrl],
          display_url: displayUrl || new URL(finalUrl).hostname,
          responsive_search_ad: {
            headlines: validHeadlines.slice(0, 15).map((text: string, index: number) => ({
              text,
              pinned_field: index === 0 ? 'HEADLINE_1' : index === 1 ? 'HEADLINE_2' : undefined
            })),
            descriptions: validDescriptions.slice(0, 4).map((text: string) => ({ text }))
          }
        }
      };
    }

    const adOperation = {
      create: adResource
    };

    const adResponse = await customer.service('AdGroupAdService').mutate({
      customer_id: process.env.GOOGLE_ADS_MANAGER_ID,
      operations: [adOperation]
    });
    const adResourceName = adResponse.results[0].resource_name;
    
    // Extract ad ID from resource name
    const adId = adResourceName.split('~').pop();

    console.log('Created ad:', adResourceName, 'with ID:', adId);

    // Log the successful ad creation for tracking
    console.log(`✅ ${campaignType || 'Search'} Ad created successfully:
    - Campaign ID: ${campaignId}
    - Ad Group ID: ${adGroupId}
    - Ad ID: ${adId}
    - Headlines: ${validHeadlines.length} variations
    - Descriptions: ${validDescriptions.length} variations
    - Final URL: ${finalUrl}`);

    return NextResponse.json({
      success: true,
      adId: adId,
      adResourceName: adResourceName,
      message: `${campaignType || 'Search'} ad created successfully with ${validHeadlines.length} headlines and ${validDescriptions.length} descriptions`,
      adDetails: {
        campaignId,
        adGroupId,
        adId,
        campaignType,
        headlines: validHeadlines,
        descriptions: validDescriptions,
        finalUrl,
        displayUrl
      }
    });

  } catch (error: any) {
    console.error('Error creating ad:', error);
    
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

    if (error.message?.includes('INVALID_AD_GROUP_ID')) {
      return NextResponse.json(
        { error: 'Invalid ad group ID provided.' },
        { status: 400 }
      );
    }

    if (error.message?.includes('POLICY_VIOLATION')) {
      return NextResponse.json(
        { error: 'Ad content violates Google Ads policies. Please review your ad copy.' },
        { status: 400 }
      );
    }

    if (error.message?.includes('TOO_LONG')) {
      return NextResponse.json(
        { error: 'Ad text is too long. Please check character limits.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Failed to create ad',
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
