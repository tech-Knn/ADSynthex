import { GoogleAdsApi } from 'google-ads-api';

// Interface for customer account data
export interface CustomerAccount {
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

/**
 * Fetch all accounts under the MCC and log them to console
 * @returns Promise with account data and analysis
 */
export async function logAllMCCAccounts(): Promise<{
  success: boolean;
  accounts: CustomerAccount[];
  managedAccounts: CustomerAccount[];
  summary: {
    total: number;
    managed: number;
    managers: number;
    test: number;
  };
  error?: string;
}> {
  // EMERGENCY: Disable MCC discovery due to rate limit
  console.log('=== MCC ACCOUNTS DISCOVERY DISABLED DUE TO RATE LIMIT ===');
  return {
    success: false,
    error: 'MCC discovery disabled due to Google Ads API rate limit ban',
    accounts: [],
    managedAccounts: [],
    summary: { total: 0, managed: 0, managers: 0, test: 0 }
  };

  /* DISABLED DUE TO RATE LIMIT BAN
  try {
    console.log('=== FETCHING ALL ACCOUNTS UNDER MCC ===');
    
    // Check required environment variables
    const requiredEnvVars = [
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_MANAGER_ID'
    ];
    
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      const error = `Missing environment variables: ${missingVars.join(', ')}`;
      console.error(error);
      return {
        success: false,
        accounts: [],
        managedAccounts: [],
        summary: { total: 0, managed: 0, managers: 0, test: 0 },
        error
      };
    }

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
    
    // Separate accounts by type
    const managedAccounts = processedAccounts.filter(acc => !acc.is_manager && !acc.is_test_account);
    const managerAccounts = processedAccounts.filter(acc => acc.is_manager);
    const testAccounts = processedAccounts.filter(acc => acc.is_test_account);
    
    // Log all accounts in detail
    console.log('\n=== ALL ACCOUNTS UNDER MCC ===');
    console.log(`Total accounts found: ${processedAccounts.length}`);
    
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
    });
    
    console.log('\n=== ACCOUNT SUMMARY ===');
    console.log(`Total accounts: ${processedAccounts.length}`);
    console.log(`Managed accounts (non-manager, non-test): ${managedAccounts.length}`);
    console.log(`Manager accounts: ${managerAccounts.length}`);
    console.log(`Test accounts: ${testAccounts.length}`);
    
    // Log managed accounts specifically (these are the ones we want for data fetching)
    if (managedAccounts.length > 0) {
      console.log('\n=== MANAGED ACCOUNTS (TARGET FOR DATA FETCHING) ===');
      managedAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.id} - ${account.name} (${account.currency_code}, ${account.time_zone})`);
      });
      
      console.log('\n=== FORMATTED FOR TARGET_ACCOUNTS CONFIG ===');
      console.log('// Copy this to your google-ads-config.js TARGET_ACCOUNTS:');
      console.log('[');
      managedAccounts.forEach((account, index) => {
        const comma = index < managedAccounts.length - 1 ? ',' : '';
        console.log(`  { id: '${account.id}', name: '${account.name}' }${comma}`);
      });
      console.log(']');
    }
    
    console.log('\n=== MCC ACCOUNTS LOGGING COMPLETED ===\n');
    
    return {
      success: true,
      accounts: processedAccounts,
      managedAccounts,
      summary: {
        total: processedAccounts.length,
        managed: managedAccounts.length,
        managers: managerAccounts.length,
        test: testAccounts.length
      }
    };
    
  } catch (error: any) {
    console.error('Error fetching MCC accounts:', error);
    return {
      success: false,
      accounts: [],
      managedAccounts: [],
      summary: { total: 0, managed: 0, managers: 0, test: 0 },
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Utility function to call the MCC accounts API endpoint
 * @returns Promise with the API response
 */
export async function callMCCAccountsAPI(): Promise<any> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/google-ads/accounts`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling MCC accounts API:', error);
    throw error;
  }
}

