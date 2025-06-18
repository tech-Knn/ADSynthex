# AdSyntheX Architecture Overview

## System Architecture

AdSyntheX is built on a Next.js framework using the App Router architecture. The application integrates data from two primary sources:

1. **Ads.com API** - For revenue data
2. **Google Ads API** - For cost data

The system correlates these data sources based on URL slugs to provide a unified view of marketing performance.

```
┌─────────────────┐     ┌──────────────────┐
│                 │     │                  │
│   Ads.com API   │     │  Google Ads API  │
│                 │     │                  │
└────────┬────────┘     └────────┬─────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│                                         │
│               Next.js API               │
│      (Data Fetching & Processing)       │
│                                         │
└────────────────────┬────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│                                         │
│          React/Next.js Frontend         │
│        (Components & Rendering)         │
│                                         │
└─────────────────────────────────────────┘
```

## Directory Structure

```
AdSyntheX/
├── app/                    # Next.js App Router
│   ├── analytics/          # Analytics page
│   ├── api/                # API routes
│   │   ├── adscom/         # Ads.com API route
│   │   └── google-ads/     # Google Ads API route
│   ├── dashboard/          # Main dashboard page
│   └── layout.tsx          # Root layout
├── components/             # React components
│   ├── Dashboard/          # Dashboard specific components
│   ├── Layout/             # Layout components
│   └── Providers/          # Context providers
├── lib/                    # Utility functions and API clients
│   ├── adscom-api.ts       # Ads.com API client
│   └── google-ads-api.ts   # Google Ads API client
├── public/                 # Static assets
└── styles/                 # Global styles
```

## Key Components

### API Integration

1. **adscom-api.ts**: Handles authentication and data fetching from the Ads.com API
2. **google-ads-api.ts**: Manages Google Ads API authentication and queries

### Dashboard Components

1. **DataTable.tsx**: Main component for displaying combined data with metrics
2. **SummaryCards.tsx**: Shows aggregated metrics at the top of the dashboard
3. **DateRangePicker.tsx**: Allows users to select custom date ranges

### Page Components

1. **dashboard/page.tsx**: Main dashboard page with date controls
2. **analytics/page.tsx**: Detailed analytics page with additional insights

## Data Flow

1. User selects a date range or predefined period (Today, Yesterday, Last 3 Days)
2. API calls are made to both Ads.com and Google Ads APIs
3. Data is processed in the backend API routes
4. Processed data is returned to the frontend
5. Data is matched and combined using URL slug matching
6. Combined data is rendered in the DataTable component
7. Aggregated metrics are displayed in the SummaryCards

## URL Slug Matching Logic

The system uses several matching strategies to correlate ads with articles:

1. **Exact Match**: Directly matches normalized URL slugs
2. **Partial Match**: Checks if one slug contains another
3. **Keyword Match**: Extracts keywords from slugs and matches based on those

## Authentication & Security

- API credentials are stored in environment variables
- API routes are protected and handle credential verification
- Mock data fallback if API credentials are missing or invalid

## Mock Data System

The application includes a comprehensive mock data system that:

1. Generates realistic data for development
2. Provides fallback when API connections fail
3. Simulates date range behavior for testing

## Responsive Design

The UI is fully responsive with breakpoints for:
- Mobile (<768px)
- Tablet (768-992px)
- Desktop (>992px)