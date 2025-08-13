import { NextRequest, NextResponse } from 'next/server';
import { GoogleAdsApi } from 'google-ads-api';

// Initialize Google Ads client for MCC account queries
function initializeMCCClient() {
  try {
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
    });
    
    // Create MCC customer instance
    const mccCustomer = client.Customer({
      customer_id: process.env.GOOGLE_ADS_MANAGER_ID || '',
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
      login_customer_id: process.env.GOOGLE_ADS_MANAGER_ID || ''
    });
    
    return { client, mccCustomer };
  } catch (error) {
    console.error('Error initializing Google Ads MCC client:', error);
    throw error;
  }
}

// Query to get all accessible customer accounts
const CUSTOMER_ACCOUNTS_QUERY = `
  SELECT
    customer_client.id,
    customer_client.descriptive_name,
    customer_client.level,
    customer_client.status,
    customer_client.resource_name,
    customer_client.currency_code,
    customer_client.time_zone,
    customer_client.manager,
    customer_client.test_account
  FROM customer_client
  WHERE customer_client.status = 'ENABLED'
  ORDER BY customer_client.descriptive_name ASC
`;

interface CustomerAccount {
  id: string;
  name: string;
  level: number;
  status: string;
  resource_name: string;
  currency_code: string;
  time_zone: string;
  is_manager: boolean;
  is_test_account: boolean;
}

export async function GET(request: NextRequest) {
  try {
    console.log('=== MCC ACCOUNTS DISCOVERY STARTING ===');
    
    // Check if we have all required environment variables
    const requiredEnvVars = [
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_MANAGER_ID'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      console.error(`Missing environment variables for Google Ads API: ${missingVars.join(', ')}`);
      return NextResponse.json(
        { 
          error: 'Missing environment variables',
          missing: missingVars,
          message: 'Please configure all required Google Ads API credentials'
        },
        { status: 400 }
      );
    }

    console.log('Environment variables validation passed');
    console.log('MCC Account ID:', process.env.GOOGLE_ADS_MANAGER_ID);
    
    // Initialize the MCC client
    const { mccCustomer } = initializeMCCClient();
    
    console.log('Querying all accessible customer accounts under MCC...');
    
    // Execute the query to get all customer accounts
    const customerAccounts = await mccCustomer.query(CUSTOMER_ACCOUNTS_QUERY);
    
    console.log(`Found ${customerAccounts.length} customer accounts under MCC`);
    
    // Process and format the results
    const processedAccounts: CustomerAccount[] = customerAccounts.map((account: any) => {
      const customerClient = account.customer_client;
      
      return {
        id: customerClient.id?.toString() || 'unknown',
        name: customerClient.descriptive_name || 'Unknown Account',
        level: customerClient.level || 0,
        status: customerClient.status || 'unknown',
        resource_name: customerClient.resource_name || '',
        currency_code: customerClient.currency_code || 'USD',
        time_zone: customerClient.time_zone || 'UTC',
        is_manager: customerClient.manager || false,
        is_test_account: customerClient.test_account || false
      };
    });
    
    // Log all accounts in a detailed format
    console.log('\n=== ALL ACCOUNTS UNDER MCC ===');
    console.log(`Total accounts found: ${processedAccounts.length}`);
    console.log('Account details:');
    
    processedAccounts.forEach((account, index) => {
      console.log(`\n--- Account ${index + 1} ---`);
      console.log(`ID: ${account.id}`);
      console.log(`Name: ${account.name}`);
      console.log(`Status: ${account.status}`);
      console.log(`Level: ${account.level}`);
      console.log(`Currency: ${account.currency_code}`);
      console.log(`Time Zone: ${account.time_zone}`);
      console.log(`Is Manager Account: ${account.is_manager}`);
      console.log(`Is Test Account: ${account.is_test_account}`);
      console.log(`Resource Name: ${account.resource_name}`);
    });
    
    // Separate accounts by type
    const managedAccounts = processedAccounts.filter(acc => !acc.is_manager && !acc.is_test_account);
    const managerAccounts = processedAccounts.filter(acc => acc.is_manager);
    const testAccounts = processedAccounts.filter(acc => acc.is_test_account);
    
    console.log('\n=== ACCOUNT SUMMARY ===');
    console.log(`Total accounts: ${processedAccounts.length}`);
    console.log(`Managed accounts (non-manager, non-test): ${managedAccounts.length}`);
    console.log(`Manager accounts: ${managerAccounts.length}`);
    console.log(`Test accounts: ${testAccounts.length}`);
    
    // Log managed accounts specifically
    if (managedAccounts.length > 0) {
      console.log('\n=== MANAGED ACCOUNTS (TARGET FOR DATA FETCHING) ===');
      managedAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.id} - ${account.name} (${account.currency_code})`);
      });
    }
    
    // Compare with current TARGET_ACCOUNTS configuration
    const currentTargetAccounts = [
      { id: '8677814915', name: 'Ads.com - RSOC - IST' },
      { id: '9071440966', name: 'Ads.com - RSOC - UTC - 02' },
      { id: '5723554317', name: 'Ads.com - RSOC - UTC - 03' },
      { id: '3146253756', name: 'Ads.com - RSOC - UTC - 04' },
      { id: '5857090949', name: 'Ads.com - RSOC - UTC - 05' },
      { id: '6201189752', name: 'Ads.com - RSOC - UTC - 06' },
      { id: '4071621621', name: 'Ads.com - RSOC - UTC - 07' },
      { id: '7579121709', name: 'Ads.com - RSOC - UTC - 08' },
      { id: '1918795911', name: 'Ads.com - RSOC - UTC - 09' },
      { id: '2849704713', name: 'Ads.com - RSOC - UTC - 10' },
      { id: '7605096292', name: 'Ads.com - RSOC - UTC - 11' },
      { id: '5719842337', name: 'Ads.com - RSOC - UTC - 12' },
      { id: '9341614254', name: 'Ads.com - RSOC - UTC - 13' },
      { id: '4277350349', name: 'RSOC - UTC - Ads.com' }
    ];
    
    console.log('\n=== CONFIGURATION COMPARISON ===');
    console.log(`Current TARGET_ACCOUNTS count: ${currentTargetAccounts.length}`);
    console.log(`Discovered managed accounts count: ${managedAccounts.length}`);
    
    // Find accounts in config but not discovered
    const configAccountIds = currentTargetAccounts.map(acc => acc.id);
    const discoveredAccountIds = managedAccounts.map(acc => acc.id);
    
    const missingFromDiscovered = configAccountIds.filter(id => !discoveredAccountIds.includes(id));
    const newlyDiscovered = discoveredAccountIds.filter(id => !configAccountIds.includes(id));
    
    if (missingFromDiscovered.length > 0) {
      console.log('\nAccounts in config but NOT found in MCC:');
      missingFromDiscovered.forEach(id => {
        const configAccount = currentTargetAccounts.find(acc => acc.id === id);
        console.log(`- ${id} (${configAccount?.name || 'Unknown'})`);
      });
    }
    
    if (newlyDiscovered.length > 0) {
      console.log('\nNewly discovered accounts NOT in config:');
      newlyDiscovered.forEach(id => {
        const discoveredAccount = managedAccounts.find(acc => acc.id === id);
        console.log(`- ${id} (${discoveredAccount?.name || 'Unknown'})`);
      });
    }
    
    console.log('\n=== MCC ACCOUNTS DISCOVERY COMPLETED ===\n');
    
    // Return the results
    return NextResponse.json({
      success: true,
      mcc_account_id: process.env.GOOGLE_ADS_MANAGER_ID,
      summary: {
        total_accounts: processedAccounts.length,
        managed_accounts: managedAccounts.length,
        manager_accounts: managerAccounts.length,
        test_accounts: testAccounts.length
      },
      accounts: {
        all: processedAccounts,
        managed: managedAccounts,
        managers: managerAccounts,
        test: testAccounts
      },
      configuration_analysis: {
        current_config_count: currentTargetAccounts.length,
        discovered_managed_count: managedAccounts.length,
        missing_from_discovered: missingFromDiscovered,
        newly_discovered: newlyDiscovered
      },
      message: 'All accounts under MCC have been logged to console'
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching MCC accounts:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch accounts from MCC',
      details: error.message || 'Unknown error occurred',
      message: 'Check server logs for detailed error information'
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  }
}

