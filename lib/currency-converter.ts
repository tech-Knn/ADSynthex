import { convertToUsd } from './currency-service';

/**
 * Account currency mapping
 * Maps Google Ads customer IDs to their account currency
 *
 * SCALABLE APPROACH: Only list non-USD accounts here
 * All unlisted accounts automatically default to USD
 */
export const ACCOUNT_CURRENCIES: Record<string, string> = {
  // All Predicto accounts use USD (default)
  // All CarHp accounts use USD (default)
  // Removed incorrect IDR mappings - these accounts use USD natively
  // '5079394847': CarHp New 02 - USD
  // '8536037999': CarHp New 01 - USD
  // '1161525078': CAR-HP-01 - USD
  // '9345796923': CAR-HP-02 - USD
  // '1558940550': CarHp New 03 - USD
  // '1791919543': CarHp New 04 - USD
  // '7839557944': CarHp New 05 - USD

  // Future: Add other non-USD accounts here as needed
  // Example:
  // '1234567890': 'EUR', // European account
  // '9876543210': 'GBP', // UK account
};

/**
 * List of supported currencies with their properties
 * Used for validation and display purposes
 */
export const SUPPORTED_CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', conversion: false },
  IDR: { symbol: 'Rp', name: 'Indonesian Rupiah', conversion: true },
  EUR: { symbol: '€', name: 'Euro', conversion: true },
  // Add more as needed
} as const;

/**
 * Get currency code for a customer account
 * @param customerId - Google Ads customer ID
 * @returns Currency code (USD, IDR, EUR, etc.)
 */
export function getAccountCurrency(customerId: string): string {
  return ACCOUNT_CURRENCIES[customerId] || 'USD';
}

/**
 * Convert campaign costs to USD based on account currency
 * @param campaigns - Array of campaigns with cost data
 * @returns Campaigns with costs converted to USD
 */
export async function convertCampaignCostsToUsd<T extends {
  customer_id?: string;
  cost?: number;
  cost_micros?: number;
}>(campaigns: T[]): Promise<T[]> {
  const converted = await Promise.all(
    campaigns.map(async (campaign) => {
      if (!campaign.customer_id) {
        return campaign;
      }

      const currency = getAccountCurrency(campaign.customer_id);

      // If already USD, no conversion needed
      if (currency === 'USD') {
        return campaign;
      }

      // Convert cost to USD
      if (campaign.cost !== undefined && campaign.cost > 0) {
        const originalCost = campaign.cost;
        const convertedCost = await convertToUsd(originalCost, currency);

        console.log(
          `[CURRENCY] Converting account ${campaign.customer_id}: ${originalCost.toFixed(2)} ${currency} → $${convertedCost.toFixed(2)} USD`
        );

        return {
          ...campaign,
          cost: convertedCost,
          cost_micros: Math.round(convertedCost * 1000000),
          original_cost: originalCost,
          original_currency: currency,
        };
      }

      return campaign;
    })
  );

  return converted;
}

/**
 * Check if an account uses non-USD currency
 * @param customerId - Google Ads customer ID
 * @returns true if account uses IDR, EUR, or other non-USD currency
 */
export function isNonUsdAccount(customerId: string): boolean {
  return getAccountCurrency(customerId) !== 'USD';
}

/**
 * Get list of all non-USD account IDs
 */
export function getNonUsdAccounts(): string[] {
  return Object.keys(ACCOUNT_CURRENCIES);
}
