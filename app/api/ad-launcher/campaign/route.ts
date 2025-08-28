import { NextRequest, NextResponse } from 'next/server';
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
    const { client, customer } = initializeGoogleAdsClient();
    
    // Convert daily budget to micros (Google Ads uses micros for currency)
    const budgetMicros = Math.round(budget * 1000000);
    
    // Create budget first using mutate_campaign_budgets
    const budgetResource = {
      name: `Budget for ${name}`,
      amount_micros: budgetMicros,
      delivery_method: 'STANDARD'
    };

    const budgetOperation = {
      create: budgetResource
    };

    const budgetResponse = await customer.service('CampaignBudgetService').mutate({
      customer_id: process.env.GOOGLE_ADS_MANAGER_ID,
      operations: [budgetOperation]
    });
    const budgetResourceName = budgetResponse.results[0].resource_name;

    console.log('Created budget:', budgetResourceName);

    // Create campaign using mutate_campaigns
    const campaignResource = {
      name: name,
      status: 'ENABLED',
      advertising_channel_type: campaignType === 'SEARCH' ? 'SEARCH' : 
                               campaignType === 'DISPLAY' ? 'DISPLAY' : 
                               campaignType === 'PERFORMANCE_MAX' ? 'PERFORMANCE_MAX' : 'SEARCH',
      campaign_budget: budgetResourceName,
      // Set targeting settings
      network_settings: {
        target_google_search: true,
        target_search_network: true,
        target_content_network: false,
        target_partner_search_network: false
      },
      // Set location targeting
      geo_target_type_setting: {
        positive_geo_target_type: 'PRESENCE_OR_INTEREST',
        negative_geo_target_type: 'PRESENCE'
      }
    };

    const campaignOperation = {
      create: campaignResource
    };

    const campaignResponse = await customer.service('CampaignService').mutate({
      customer_id: process.env.GOOGLE_ADS_MANAGER_ID,
      operations: [campaignOperation]
    });
    const campaignResourceName = campaignResponse.results[0].resource_name;
    
    // Extract campaign ID from resource name
    const campaignId = campaignResourceName.split('/').pop();

    console.log('Created campaign:', campaignResourceName, 'with ID:', campaignId);

    // Add location targeting (simplified to US for this example)
    if (targetLocation.toLowerCase().includes('united states') || targetLocation.toLowerCase().includes('us')) {
      const locationCriterion = {
        campaign: campaignResourceName,
        location: {
          geo_target_constant: 'geoTargetConstants/2840' // United States
        }
      };

      const locationOperation = {
        create: locationCriterion
      };

      try {
        await customer.service('CampaignCriterionService').mutate({
          customer_id: process.env.GOOGLE_ADS_MANAGER_ID,
          operations: [locationOperation]
        });
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
      message: `Campaign "${name}" created successfully`
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
        details: error.message || 'Unknown error'
      },
      { status: 500 }
    );
  }
}
