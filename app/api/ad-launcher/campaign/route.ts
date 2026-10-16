import { NextRequest, NextResponse } from 'next/server';
import { enums } from 'google-ads-api';
import { initializeGoogleAdsClient } from '@/lib/google-ads-api';

export async function POST(request: NextRequest) {
  try {
    const { name, budget, targetLocation, campaignType } = await request.json();

    console.log('Creating campaign with data:', { name, budget, targetLocation, campaignType });

    // Validate required fields
    if (!name || !budget || !targetLocation || !campaignType) {
      return NextResponse.json(
        { error: 'Missing required fields: name, budget, targetLocation, campaignType' },
        { status: 400 }
      );
    }

    // Initialize Google Ads client
    const { customer } = initializeGoogleAdsClient();

    // Convert daily budget to micros (Google Ads uses micros for currency)
    const budgetMicros = Math.round(budget * 1000000);

    // Create budget first
    const budgetResponse = await customer.campaignBudgets.create([
      {
        name: `Budget for ${name}`,
        amount_micros: budgetMicros,
        delivery_method: enums.BudgetDeliveryMethod.STANDARD,
      },
    ]);
    const budgetResourceName = budgetResponse.results?.[0]?.resource_name;
    if (!budgetResourceName) {
      throw new Error('Budget creation returned no resource_name');
    }

    console.log('Created budget:', budgetResourceName);

    // Map the requested campaign type to the Google Ads enum
    const channelType =
      campaignType === 'DISPLAY' ? enums.AdvertisingChannelType.DISPLAY :
      campaignType === 'PERFORMANCE_MAX' ? enums.AdvertisingChannelType.PERFORMANCE_MAX :
      enums.AdvertisingChannelType.SEARCH;

    // Create campaign
    const campaignResponse = await customer.campaigns.create([
      {
        name: name,
        status: enums.CampaignStatus.ENABLED,
        advertising_channel_type: channelType,
        campaign_budget: budgetResourceName,
        // Set targeting settings
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: false,
          target_partner_search_network: false,
        },
        // Set location targeting
        geo_target_type_setting: {
          positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE_OR_INTEREST,
          negative_geo_target_type: enums.NegativeGeoTargetType.PRESENCE,
        },
      },
    ]);
    const campaignResourceName = campaignResponse.results?.[0]?.resource_name;
    if (!campaignResourceName) {
      throw new Error('Campaign creation returned no resource_name');
    }

    // Extract campaign ID from resource name
    const campaignId = campaignResourceName.split('/').pop();

    console.log('Created campaign:', campaignResourceName, 'with ID:', campaignId);

    // Add location targeting (simplified to US for this example)
    if (targetLocation.toLowerCase().includes('united states') || targetLocation.toLowerCase().includes('us')) {
      try {
        await customer.campaignCriteria.create([
          {
            campaign: campaignResourceName,
            location: {
              geo_target_constant: 'geoTargetConstants/2840', // United States
            },
          },
        ]);
        console.log('Added location targeting for US');
      } catch (locationError) {
        console.warn('Failed to add location targeting:', locationError);
        // Continue anyway, location targeting is optional
      }
    }

    return NextResponse.json({
      success: true,
      campaignId: campaignId,
      campaignResourceName: campaignResourceName,
      budgetResourceName: budgetResourceName,
      message: `Campaign "${name}" created successfully`,
    });

  } catch (error: any) {
    console.error('Error creating campaign:', error);

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

    return NextResponse.json(
      {
        error: 'Failed to create campaign',
        details: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}