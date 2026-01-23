/**
 * Test Predicto Channel Mapping
 * This script verifies that channel mappings are correct for Predicto accounts
 */

import {
  ACCOUNT_CHANNEL_ACCESS,
  getAllowedChannels,
  hasAccessToChannel
} from '../lib/account-access-control';

const PREDICTO_ACCOUNTS = [
  { id: '2382992113', name: 'Predicto - EST - 01' },
  { id: '1640518611', name: 'Predicto - EST - 02' },
  { id: '8091270364', name: 'Predicto - EST - 03' },
  { id: '8846129452', name: 'Predicto - EST - 04' },
  { id: '6474140466', name: 'Predicto - EST - 05' },
  { id: '4920639194', name: 'Predicto - EST - 06' },
  { id: '7282297343', name: 'Predicto - EST - 07' },
  { id: '1298005744', name: 'Predicto - EST - 08' },
];

function testChannelMappings() {
  console.log('🔍 Testing Predicto Channel Mappings\n');
  console.log('='.repeat(80));
  console.log('\n');

  let totalAccounts = 0;
  let accountsWithChannels = 0;
  let totalChannels = 0;

  PREDICTO_ACCOUNTS.forEach(account => {
    totalAccounts++;
    const accountId = `CID_${account.id}`;
    const channels = getAllowedChannels(accountId);

    console.log(` ${account.name} (${account.id})`);
    console.log(`   Account ID: ${accountId}`);

    if (channels.length > 0) {
      accountsWithChannels++;
      totalChannels += channels.length;
      console.log(`   Channels: ${channels.length} channels configured`);
      console.log(`   📌 Channel IDs: ${channels.join(', ')}`);

      // Test a few channel access checks
      const testChannel = channels[0];
      const hasAccess = hasAccessToChannel(accountId, testChannel);
      console.log(` Access Test: hasAccessToChannel('${accountId}', '${testChannel}') = ${hasAccess}`);

      if (!hasAccess) {
        console.log(`   ERROR: Channel access check failed!`);
      }
    } else {
      console.log(`    WARNING: No channels configured for this account`);
      console.log(`  This account will use dynamic channel detection from Final URLs`);
    }

    console.log('');
  });

  // Summary
  console.log('='.repeat(80));
  console.log('\n SUMMARY\n');
  console.log(`   Total Predicto Accounts: ${totalAccounts}`);
  console.log(`   Accounts with Channel Mappings: ${accountsWithChannels}`);
  console.log(`   Accounts without Mappings: ${totalAccounts - accountsWithChannels}`);
  console.log(`   Total Channels Mapped: ${totalChannels}`);
  console.log(`   Average Channels per Account: ${(totalChannels / accountsWithChannels).toFixed(1)}`);

  // Check for specific problematic accounts mentioned by user
  console.log('\n SPECIFIC ACCOUNT CHECKS\n');

  const problematicAccounts = [
    { id: '1640518611', name: 'EST 02' },
    { id: '8091270364', name: 'EST 03' },
    { id: '8846129452', name: 'EST 04' },
  ];

  problematicAccounts.forEach(account => {
    const accountId = `CID_${account.id}`;
    const channels = getAllowedChannels(accountId);

    console.log(`   ${account.name} (${account.id}):`);
    if (channels.length > 0) {
      console.log(`      Configured with ${channels.length} channels: ${channels.join(', ')}`);
    } else {
      console.log(`      NOT CONFIGURED - will not map correctly!`);
    }
  });

  // Recommendations
  console.log('\n RECOMMENDATIONS\n');
  if (accountsWithChannels === totalAccounts) {
    console.log('   All accounts have channel mappings configured');
    console.log('   Predicto integration should work correctly');
  } else {
    console.log(`    ${totalAccounts - accountsWithChannels} account(s) missing channel mappings`);
    console.log('   Add channel mappings to ACCOUNT_CHANNEL_ACCESS in lib/account-access-control.ts');
  }

  console.log('\n' + '='.repeat(80));
  console.log('\nChannel mapping test complete!\n');
}

// Run the test
testChannelMappings();
