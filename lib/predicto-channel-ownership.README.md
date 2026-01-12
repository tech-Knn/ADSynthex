# Predicto Channel Ownership Configuration

## Purpose
This configuration file defines which Predicto channel IDs belong to which Google Ads account. It prevents revenue from one account from appearing in another account's dashboard.

## Problem Fixed
Without this configuration:
- ch88105 from EST-04 was showing in EST-05
- ch88111 from another account was showing in EST-08
- ch88102 from another account was showing in EST-03
- ch88099 and ch88100 were showing in EST-02 but don't belong there

## How to Use

### Step 1: Find Your Account's Channel IDs

For each account (EST-01 through EST-08), you need to find which channel IDs belong to it:

1. **Check Predicto Dashboard**: Log into Predicto and note which channels are configured for each account
2. **Check Google Ads URLs**: Look at the `cid` parameter in your campaign final URLs
3. **Use the Diagnostic Logs**: When you load an account in Synthex, check the logs for:
   ```
   [PREDICTO_CHANNEL_MAPPING] Sample Predicto channels (normalized): ch46189, ch46190, ...
   ```

### Step 2: Update the Configuration

Edit `lib/predicto-channel-ownership.ts` and add the channel IDs for each account:

```typescript
export const CHANNEL_OWNERSHIP: ChannelOwnershipConfig[] = [
  {
    customer_id: '1640518611',
    account_name: 'Predicto - EST - 02',
    channel_ids: [
      'ch46312',
      'ch46313',
      'ch46322',
      'ch46328',
      // Add more EST-02 channels here
      // DO NOT include ch88099, ch88100 (they belong to another account)
    ],
  },
  {
    customer_id: '8091270364',
    account_name: 'Predicto - EST - 03',
    channel_ids: [
      // Add EST-03 channel IDs here
      // DO NOT include ch88102
    ],
  },
  // ... configure other accounts
];
```

### Step 3: Test the Configuration

After updating the configuration:

1. Clear cache and reload the Predicto dashboard
2. Check the logs for validation messages:
   ```
   [PREDICTO_COST_REVENUE] 🔒 STRICT OWNERSHIP FILTERING for account 1640518611
   [PREDICTO_COST_REVENUE]    Account owns 10 channels: ch46312, ch46313, ...
   [PREDICTO_COST_REVENUE]    ✓ Valid channels: 10 channels correctly configured
   ```

3. If you see warnings:
   ```
   [PREDICTO_COST_REVENUE]    ⚠️  INVALID channels in campaign URLs (don't belong to this account):
   [PREDICTO_COST_REVENUE]       ch88105, ch88099
   [PREDICTO_COST_REVENUE]       These channels need to be removed/corrected in Google Ads!
   ```
   This means your Google Ads campaign URLs contain channel IDs that don't belong to this account.

## Account IDs Reference

| Account Name | Customer ID |
|-------------|-------------|
| Predicto - EST - 01 | 2382992113 |
| Predicto - EST - 02 | 1640518611 |
| Predicto - EST - 03 | 8091270364 |
| Predicto - EST - 04 | 8846129452 |
| Predicto - EST - 05 | 6474140466 |
| Predicto - EST - 06 | 4920639194 |
| Predicto - EST - 07 | 7282297343 |
| Predicto - EST - 08 | 1298005744 |

## Validation

The system will automatically:
1. ✅ Show only revenue from channels that belong to the account
2. ⚠️  Warn if campaign URLs contain channels from other accounts
3. ℹ️  Show if owned channels are missing from campaign URLs
4. 🔒 Apply strict filtering to prevent cross-account revenue leakage

## Fallback Behavior

If channel ownership is not configured (empty arrays), the system will:
- Fall back to URL-based filtering (old behavior)
- Show a warning: "No channel ownership configured for account..."
- May still allow cross-account revenue leakage

**It's strongly recommended to configure channel ownership for all accounts.**
