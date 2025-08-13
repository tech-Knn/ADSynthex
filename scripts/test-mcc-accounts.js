/**
 * Simple script to test MCC accounts functionality
 * Run this with: node scripts/test-mcc-accounts.js
 */

const { logAllMCCAccounts } = require('../lib/mcc-accounts.ts');

async function testMCCAccounts() {
  console.log('Testing MCC accounts discovery...\n');
  
  try {
    // Test the function
    const result = await logAllMCCAccounts();
    
    if (result.success) {
      console.log('✅ Successfully fetched MCC accounts!');
      console.log(`Found ${result.summary.total} total accounts`);
      console.log(`- ${result.summary.managed} managed accounts`);
      console.log(`- ${result.summary.managers} manager accounts`);
      console.log(`- ${result.summary.test} test accounts`);
      
      if (result.managedAccounts.length > 0) {
        console.log('\nManaged accounts for configuration:');
        result.managedAccounts.forEach((account, index) => {
          console.log(`${index + 1}. ${account.id} - ${account.name}`);
        });
      }
    } else {
      console.log('❌ Failed to fetch MCC accounts');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('❌ Error running test:', error.message);
  }
}

// Run the test
testMCCAccounts();

