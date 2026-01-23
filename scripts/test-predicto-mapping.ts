/**
 * Test Predicto Cost/Revenue Mapping
 * Run this script to diagnose mapping issues
 */

// Usage:
// npx tsx scripts/test-predicto-mapping.ts

const API_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testPredictoDiagnostic() {
  console.log('🔍 Running Predicto Diagnostic...\n');

  const testData = {
    startDate: '2026-01-01',
    endDate: '2026-01-07',
    customerId: '2382992113', // Change this to your customer ID
  };

  try {
    const response = await fetch(`${API_URL}/api/predicto-diagnostic`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const result = await response.json();

    if (result.status === 'error') {
      console.error('Error:', result.error);
      return;
    }

    const { diagnostic } = result;

    console.log('═══════════════════════════════════════════════');
    console.log('                  SUMMARY');
    console.log('═══════════════════════════════════════════════\n');

    console.log('📊 Google Ads:');
    console.log(`   - Total campaigns: ${diagnostic.summary.google_ads.total_campaigns}`);
    console.log(`   - Campaigns with cost: ${diagnostic.summary.google_ads.campaigns_with_cost}`);
    console.log(`   - Campaigns with URLs: ${diagnostic.summary.google_ads.campaigns_with_urls}`);
    console.log(`   - Campaigns with URLs & cost: ${diagnostic.summary.google_ads.campaigns_with_urls_and_cost}`);
    console.log(`   - Total cost: $${diagnostic.summary.google_ads.total_cost.toFixed(2)}`);
    console.log(`   - Channel IDs extracted: ${diagnostic.summary.google_ads.unique_channel_ids_extracted}`);

    console.log('\n💰 Predicto:');
    console.log(`   - Total records: ${diagnostic.summary.predicto.total_records}`);
    console.log(`   - Unique channel IDs: ${diagnostic.summary.predicto.unique_channel_ids}`);
    console.log(`   - Total revenue: $${diagnostic.summary.predicto.total_revenue.toFixed(2)}`);

    console.log('\n🔗 Mapping:');
    console.log(`   - Matched channels: ${diagnostic.summary.mapping.matched_channels}`);
    console.log(`   - Google-only channels: ${diagnostic.summary.mapping.google_only_channels}`);
    console.log(`   - Predicto-only channels: ${diagnostic.summary.mapping.predicto_only_channels}`);
    console.log(`   - Matched cost: $${diagnostic.summary.mapping.matched_cost.toFixed(2)}`);
    console.log(`   - Matched revenue: $${diagnostic.summary.mapping.matched_revenue.toFixed(2)}`);
    console.log(`   - Unmatched cost: $${diagnostic.summary.mapping.unmatched_cost.toFixed(2)}`);
    console.log(`   - Unmatched revenue: $${diagnostic.summary.mapping.unmatched_revenue.toFixed(2)}`);
    console.log(`   - Match rate (by channel): ${diagnostic.summary.mapping.match_rate_by_channel.toFixed(1)}%`);
    console.log(`   - Match rate (by cost): ${diagnostic.summary.mapping.match_rate_by_cost.toFixed(1)}%`);
    console.log(`   - Match rate (by revenue): ${diagnostic.summary.mapping.match_rate_by_revenue.toFixed(1)}%`);

    if (diagnostic.issues.length > 0) {
      console.log('\n═══════════════════════════════════════════════');
      console.log('                  ISSUES FOUND');
      console.log('═══════════════════════════════════════════════\n');

      diagnostic.issues.forEach((issue: any, index: number) => {
        const emoji = issue.severity === 'CRITICAL' ? '🚨' : issue.severity === 'WARNING' ? '' : 'ℹ️';
        console.log(`${emoji} Issue ${index + 1} [${issue.severity}]`);
        console.log(`   Problem: ${issue.issue}`);
        console.log(`   Impact: ${issue.impact}`);
        console.log(`   Affected: ${issue.affected}`);
        console.log('');
      });
    } else {
      console.log('\nNo critical issues found!');
    }

    if (diagnostic.recommendations.length > 0) {
      console.log('\n═══════════════════════════════════════════════');
      console.log('               RECOMMENDATIONS');
      console.log('═══════════════════════════════════════════════\n');

      diagnostic.recommendations.forEach((rec: any, index: number) => {
        console.log(`💡 Recommendation ${index + 1}:`);
        console.log(`   Action: ${rec.action}`);
        console.log(`   Details: ${rec.details}`);
        if (rec.example) {
          console.log(`   Example: ${rec.example}`);
        }
        if (rec.google_ads_channel_ids) {
          console.log(`   Google Ads channels: ${rec.google_ads_channel_ids.join(', ')}`);
        }
        if (rec.predicto_channel_ids) {
          console.log(`   Predicto channels: ${rec.predicto_channel_ids.join(', ')}`);
        }
        if (rec.missing_channels) {
          console.log(`   Missing channels: ${rec.missing_channels.join(', ')}`);
        }
        if (rec.orphaned_channels) {
          console.log(`   Orphaned channels: ${rec.orphaned_channels.join(', ')}`);
        }
        console.log('');
      });
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('              SAMPLE CAMPAIGNS');
    console.log('═══════════════════════════════════════════════\n');

    if (diagnostic.details.sample_campaigns.length > 0) {
      diagnostic.details.sample_campaigns.slice(0, 5).forEach((campaign: any, index: number) => {
        console.log(`Campaign ${index + 1}:`);
        console.log(`   ID: ${campaign.campaign_id}`);
        console.log(`   Name: ${campaign.campaign_name}`);
        console.log(`   Cost: $${campaign.cost.toFixed(2)}`);
        console.log(`   Has URLs: ${campaign.has_urls ? '' : ''}`);
        console.log(`   Has channel IDs: ${campaign.has_channel_ids ? '' : ''}`);
        if (campaign.extracted_channel_ids.length > 0) {
          console.log(`   Channel IDs: ${campaign.extracted_channel_ids.join(', ')}`);
        }
        if (campaign.final_urls.length > 0) {
          console.log(`   Sample URL: ${campaign.final_urls[0]}`);
        }
        console.log('');
      });
    } else {
      console.log('   No campaigns found');
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('              CHANNEL ID COMPARISON');
    console.log('═══════════════════════════════════════════════\n');

    console.log('Google Ads Channel IDs:');
    if (diagnostic.details.all_google_channel_ids.length > 0) {
      console.log(`   ${diagnostic.details.all_google_channel_ids.join(', ')}`);
    } else {
      console.log('   None extracted (check Final URLs!)');
    }

    console.log('\nPredicto Channel IDs:');
    if (diagnostic.details.all_predicto_channel_ids.length > 0) {
      console.log(`   ${diagnostic.details.all_predicto_channel_ids.slice(0, 20).join(', ')}${diagnostic.details.all_predicto_channel_ids.length > 20 ? '...' : ''}`);
    } else {
      console.log('   None found');
    }

    console.log('\n═══════════════════════════════════════════════\n');

  } catch (error: any) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testPredictoDiagnostic();
