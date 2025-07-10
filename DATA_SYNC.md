# AdSyntheX Data Synchronization with Ads.com

This document explains how AdSyntheX synchronizes data with Ads.com to ensure real-time updates.

## Data Update Schedule

Ads.com updates their data every 15 minutes, at the following intervals:

- XX:00 (on the hour)
- XX:15 (quarter past)
- XX:30 (half past)
- XX:45 (quarter to)

Previously, there was a 15-minute gap between when Ads.com updated their data and when it appeared in the AdSyntheX dashboard. This document explains the implementation that fixes this issue.

## Implementation Details

### 1. Update Time Tracking

The system now tracks two key pieces of information:

- `lastUpdated`: Timestamp of when Ads.com last updated their data
- `nextUpdateIn`: Seconds remaining until the next scheduled update

This information is fetched from the Ads.com API when available, or calculated based on the current time.

### 2. Auto-Refresh Mechanism

The dashboard now includes an auto-refresh feature that:

1. Automatically refreshes the data when Ads.com updates (every 15 minutes)
2. Shows a countdown timer to the next update
3. Can be toggled on/off by users

### 3. API Integration

- The `getLastUpdateTime()` function in `lib/adscom-api.ts` retrieves or calculates the update schedule
- All API responses now include `lastUpdated` and `nextUpdateIn` fields
- The dashboard displays this information to users

## User Interface

The dashboard header now shows:

1. When data was last updated (e.g., "5 minutes ago")
2. Time until next update (e.g., "Next update in: 9m 45s")
3. An auto-refresh toggle switch

## Technical Implementation

### API Layer

- Enhanced `fetchRevenueData()` to include update time information
- Added `getLastUpdateTime()` function to query Ads.com's update status
- Updated mock data functions to simulate the real update schedule

### Frontend

- Added auto-refresh timer using React's useRef and setTimeout
- Implemented human-readable formatting for update times
- Added UI components to display update status

## Troubleshooting

If the data is not updating as expected:

1. Check that auto-refresh is enabled (toggle in the dashboard header)
2. Verify network connectivity to Ads.com API
3. Check browser console for any error messages
4. Manually refresh the data using the "Refresh Data" button

## Future Improvements

- Add notification when new data is available
- Implement partial data refresh to minimize API calls
- Add historical update time tracking to identify patterns in data availability 