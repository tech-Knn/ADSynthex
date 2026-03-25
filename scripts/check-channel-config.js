/**
 * Simple Channel Configuration Checker
 * Reads the channel configuration and identifies issues
 */

// Read configuration files
const fs = require('fs');
const path = require('path');

// Read account-access-control.ts
const accessControlPath = path.join(__dirname, '../lib/account-access-control.ts');
const accessControlContent = fs.readFileSync(accessControlPath, 'utf8');

// Read predicto-channel-ownership.ts
const ownershipPath = path.join(__dirname, '../lib/predicto-channel-ownership.ts');
const ownershipContent = fs.readFileSync(ownershipPath, 'utf8');

console.log('\n' + '='.repeat(80));
console.log('  PREDICTO CHANNEL CONFIGURATION ANALYSIS');
console.log('='.repeat(80) + '\n');

// Define all Predicto accounts
const allPredictoAccounts = [
  { id: '2382992113', name: 'Predicto - EST - 01' },
  { id: '1640518611', name: 'Predicto - EST - 02' },
  { id: '8091270364', name: 'Predicto - EST - 03' },
  { id: '8846129452', name: 'Predicto - EST - 04' },
  { id: '6474140466', name: 'Predicto - EST - 05' },
  { id: '4920639194', name: 'Predicto - EST - 06' },
  { id: '7282297343', name: 'Predicto - EST - 07' },
  { id: '1298005744', name: 'Predicto - EST - 08' },
  { id: '5777354952', name: 'Predicto - EST - 09' },  // ⚠️ THE PROBLEM ACCOUNT
  { id: '1449565595', name: 'Predicto - EST - 10' },
  { id: '3485355192', name: 'Predicto - EST - 11' },
  { id: '8395624186', name: 'Predicto - EST - 12' },
  { id: '2866937044', name: 'Predicto - EST - 13' },
  { id: '8474169341', name: 'Predicto - EST - 14' },
  { id: '4690287335', name: 'Predicto - EST - 15' },
  { id: '9352426268', name: 'Predicto - EST - 16' },
  { id: '9084810037', name: 'Predicto - EST - 17' },
  { id: '4517107811', name: 'Predicto - EST - 18' },
  { id: '4272056005', name: 'Predicto - EST - 19' },
  { id: '2563438099', name: 'Predicto - EST - 20' },
  { id: '6731595092', name: 'Predicto - EST - 21' },
  { id: '8656375545', name: 'Predicto - EST - 22' },
  { id: '5802421650', name: 'Predicto - EST - 23' },
  { id: '1213532895', name: 'Predicto - EST - 24' },
  { id: '7273310309', name: 'Predicto - EST - 25' },
  { id: '3318899588', name: 'Predicto - EST - 26' },
  { id: '8997459454', name: 'Predicto - EST - 27' },
  { id: '5556851600', name: 'Predicto - EST - 28' },
  { id: '3907817554', name: 'Predicto - EST - 29' },
  { id: '7505004095', name: 'Predicto - EST - 30' },
];

// Extract channel configurations from the file
function extractChannelConfig(content, customerId) {
  // Look for the customer ID pattern in ACCOUNT_CHANNEL_ACCESS
  const pattern = new RegExp(`'CID_${customerId}':\\s*\\[([^\\]]*?)\\]`, 's');
  const match = content.match(pattern);

  if (!match) return null;

  const channelsStr = match[1];

  // Extract channel IDs (matches 'chXXXXX' patterns)
  const channelMatches = channelsStr.match(/'(ch\d+)'/g);

  if (!channelMatches) return [];

  return channelMatches.map(ch => ch.replace(/'/g, ''));
}

// Analyze each account
console.log('Channel Configuration by Account:\n');
console.log('─'.repeat(80));

let totalChannels = 0;
const accountsWithNoChannels = [];
const accountsWithChannels = [];

allPredictoAccounts.forEach((account, index) => {
  const channels = extractChannelConfig(accessControlContent, account.id);

  if (channels === null) {
    console.log(`⚠️  ${account.name.padEnd(25)} | ${account.id.padEnd(12)} | NOT CONFIGURED`);
    return;
  }

  totalChannels += channels.length;

  if (channels.length === 0) {
    accountsWithNoChannels.push(account);
    console.log(`❌ ${account.name.padEnd(25)} | ${account.id.padEnd(12)} | NO CHANNELS`);
  } else {
    accountsWithChannels.push({ ...account, channels });
    const channelPreview = channels.slice(0, 3).join(', ') + (channels.length > 3 ? '...' : '');
    console.log(`✅ ${account.name.padEnd(25)} | ${account.id.padEnd(12)} | ${channels.length.toString().padStart(2)} channels: ${channelPreview}`);
  }
});

console.log('─'.repeat(80));
console.log(`\nTotal Configured Channels: ${totalChannels}`);
console.log(`Accounts WITH channels: ${accountsWithChannels.length}`);
console.log(`Accounts WITHOUT channels: ${accountsWithNoChannels.length}\n`);

// Show problem accounts
if (accountsWithNoChannels.length > 0) {
  console.log('\n' + '='.repeat(80));
  console.log('  ⚠️  ACCOUNTS WITH NO CHANNELS (REVENUE WILL NOT FETCH)');
  console.log('='.repeat(80) + '\n');

  accountsWithNoChannels.forEach((account, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${account.name} (${account.id})`);

    if (account.id === '5777354952') {
      console.log('    👆 THIS IS THE PROBLEM ACCOUNT MENTIONED BY USER!');
    }
  });

  console.log('\n' + '─'.repeat(80));
  console.log('WHY THIS IS A PROBLEM:');
  console.log('─'.repeat(80));
  console.log('When an account has NO channels configured:');
  console.log('  1. System cannot map Predicto revenue to this account');
  console.log('  2. Revenue filtering blocks all revenue to prevent cross-account leakage');
  console.log('  3. Account shows COST ONLY (no revenue matching)');
  console.log('');
  console.log('SOLUTION:');
  console.log('  1. Identify which channel IDs belong to each account');
  console.log('  2. Update lib/account-access-control.ts ACCOUNT_CHANNEL_ACCESS');
  console.log('  3. Update lib/predicto-channel-ownership.ts CHANNEL_OWNERSHIP');
  console.log('  4. Add ?cid=chXXXXX to campaign final URLs in Google Ads\n');
}

// Show accounts with channels for reference
console.log('\n' + '='.repeat(80));
console.log('  ✅ ACCOUNTS WITH PROPER CHANNEL CONFIGURATION');
console.log('='.repeat(80) + '\n');

accountsWithChannels.slice(0, 5).forEach((account) => {
  console.log(`${account.name}:`);
  console.log(`  Channels: ${account.channels.join(', ')}`);
  console.log('');
});

if (accountsWithChannels.length > 5) {
  console.log(`... and ${accountsWithChannels.length - 5} more accounts\n`);
}

// Final recommendations
console.log('\n' + '='.repeat(80));
console.log('  📋 RECOMMENDED ACTIONS');
console.log('='.repeat(80) + '\n');

if (accountsWithNoChannels.length > 0) {
  console.log('1. HIGH PRIORITY: Fix accounts with no channels');
  console.log(`   Affected: ${accountsWithNoChannels.map(a => a.name).join(', ')}`);
  console.log('');
  console.log('2. For EST-09 (5777354952) specifically:');
  console.log('   - Check Predicto dashboard to identify which channels this account uses');
  console.log('   - Check Google Ads campaigns for EST-09 to see which ?cid= parameters are in final URLs');
  console.log('   - Add those channel IDs to the configuration');
  console.log('');
}

console.log('3. Test channel extraction:');
console.log('   - Visit /api/predicto-channel-diagnostic to see which channels have revenue');
console.log('   - Compare with configured channels to find orphaned revenue');
console.log('');

console.log('4. Verify revenue matching:');
console.log('   - Run a test fetch for EST-09 after configuration update');
console.log('   - Check server logs for channel matching diagnostics');
console.log('');

console.log('='.repeat(80) + '\n');
