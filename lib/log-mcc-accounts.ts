/**
 * Simple utility to log all MCC accounts from the current configuration
 * This is a development utility to understand the current account structure
 */

import { logAllMCCAccounts } from './mcc-accounts';

/**
 * Console application to log all MCC accounts
 */
export async function runMCCAccountsLog() {
  console.log('🔍 Starting MCC Accounts Discovery...\n');
  
  // Check if we're in development mode
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  This utility should only be run in development mode');
    return;
  }
  
  try {
    const result = await logAllMCCAccounts();
    
    if (result.success) {
      console.log('\n✅ MCC Accounts Discovery Completed Successfully!');
      console.log('\n📊 Summary:');
      console.log(`   Total accounts: ${result.summary.total}`);
      console.log(`   Managed accounts: ${result.summary.managed}`);
      console.log(`   Manager accounts: ${result.summary.managers}`);
      console.log(`   Test accounts: ${result.summary.test}`);
      
      // Show the managed accounts that should be in TARGET_ACCOUNTS
      if (result.managedAccounts.length > 0) {
        console.log('\n📋 Accounts for TARGET_ACCOUNTS configuration:');
        console.log('   Copy and paste this into your google-ads-config.js:');
        console.log('\n   TARGET_ACCOUNTS: [');
        
        result.managedAccounts.forEach((account, index) => {
          const comma = index < result.managedAccounts.length - 1 ? ',' : '';
          console.log(`     { id: '${account.id}', name: '${account.name}' }${comma}`);
        });
        
        console.log('   ]');
      }
      
      console.log('\n🎉 Check the detailed logs above for complete account information!');
      
    } else {
      console.log('\n❌ Failed to discover MCC accounts');
      console.log(`   Error: ${result.error}`);
      
      // Provide helpful troubleshooting tips
      console.log('\n🔧 Troubleshooting:');
      console.log('   1. Check that all Google Ads API environment variables are set');
      console.log('   2. Verify your MCC account has access to the sub-accounts');
      console.log('   3. Ensure your developer token is approved and active');
      console.log('   4. Check that your refresh token is still valid');
    }
    
  } catch (error) {
    console.error('\n💥 Unexpected error during MCC discovery:', error);
  }
}

// If this file is run directly, execute the logging
if (require.main === module) {
  runMCCAccountsLog().catch(console.error);
}

